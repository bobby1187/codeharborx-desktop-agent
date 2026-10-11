const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const { autoUpdater } = require("electron-updater");

const AGENT_VERSION = "0.2.0";
const MCP_PORT = 48321;
let mainWindow = null;
let heartbeatTimer = null;
let mcpServer = null;
let updateStatus = { state: "idle", version: null, message: "Automatic updates enabled" };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function configPath() {
  return path.join(app.getPath("userData"), "agent-config.json");
}

async function loadStoredConfig() {
  try {
    return JSON.parse(await fsp.readFile(configPath(), "utf8"));
  } catch {
    return {};
  }
}

async function loadConfig() {
  const stored = await loadStoredConfig();
  let agentKey = stored.agentKey || "";
  if (!agentKey && stored.agentKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try { agentKey = safeStorage.decryptString(Buffer.from(stored.agentKeyEncrypted, "base64")); } catch {}
  }
  return {
    server: stored.server || "https://codeharborx.floot.app",
    nasRoot: stored.nasRoot || "\\\\10.0.0.132\\personal_folder\\Project_Backups",
    agentKey,
    deviceId: stored.deviceId || crypto.randomUUID(),
    theme: stored.theme || "dark"
  };
}

async function saveConfig(config) {
  const stored = {
    server: config.server,
    nasRoot: config.nasRoot,
    deviceId: config.deviceId || crypto.randomUUID(),
    theme: config.theme || "dark"
  };
  if (config.agentKey) {
    if (safeStorage.isEncryptionAvailable()) {
      stored.agentKeyEncrypted = safeStorage.encryptString(config.agentKey).toString("base64");
    } else {
      stored.agentKey = config.agentKey;
    }
  }
  await fsp.mkdir(path.dirname(configPath()), { recursive: true });
  await fsp.writeFile(configPath(), JSON.stringify(stored, null, 2), "utf8");
}

async function ensureConfig() {
  const config = await loadConfig();
  await saveConfig(config);
  return config;
}

async function pathExists(target) {
  try { await fsp.access(target, fs.constants.F_OK); return true; }
  catch { return false; }
}

function unwrapSuperjson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "json") ? parsed.json : parsed;
  } catch {
    return {};
  }
}

async function detectOllama() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return { status: "unavailable", models: [] };
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name || m.model).filter(Boolean) : [];
    return { status: "online", models };
  } catch {
    return { status: "offline", models: [] };
  }
}

async function sendHeartbeat(config) {
  const nasReachable = await pathExists(config.nasRoot);
  const ollama = await detectOllama();
  const body = {
    json: {
      deviceId: config.deviceId,
      deviceName: os.hostname(),
      version: AGENT_VERSION,
      nasReachable,
      localAiStatus: ollama.status,
      localModelCount: ollama.models.length,
      mcpStatus: mcpServer ? "listening" : "offline",
      mcpPort: mcpServer ? MCP_PORT : null
    }
  };
  const response = await fetch(config.server.replace(/\/+$/, "") + "/_api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.agentKey },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const data = unwrapSuperjson(text);
  if (!response.ok) throw new Error(data.error || "CodeHarborX returned HTTP " + response.status);
  return { nasReachable, ollama, data };
}

async function agentControl(config, action, input) {
  if (!config.agentKey) throw new Error("Pair the Desktop Agent with CodeHarborX first.");
  const response = await fetch(config.server.replace(/\/+$/, "") + "/_api/agent/control", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.agentKey },
    body: JSON.stringify({ json: { action, input: input || {} } })
  });
  const text = await response.text();
  const data = unwrapSuperjson(text);
  if (!response.ok) throw new Error(data.error || "CodeHarborX control request failed.");
  return data.data;
}

async function scanBackups(nasRoot) {
  if (!(await pathExists(nasRoot))) throw new Error("NAS path is not reachable.");
  const categories = ["Floot_Exports","Database_Backups","Files_and_Assets","GitHub_Snapshots","Builds_and_Installers","Restore_Points"];
  const results = [];
  for (const category of categories) {
    const categoryPath = path.join(nasRoot, category);
    const exists = await pathExists(categoryPath);
    if (!exists) { results.push({ category, exists: false, projects: 0, files: 0 }); continue; }
    const entries = await fsp.readdir(categoryPath, { withFileTypes: true });
    let files = 0;
    try {
      const children = await Promise.all(entries.filter((e) => e.isDirectory()).map(async (e) => {
        try { return (await fsp.readdir(path.join(categoryPath, e.name))).length; } catch { return 0; }
      }));
      files = children.reduce((a,b) => a+b, 0);
    } catch {}
    results.push({ category, exists: true, projects: entries.filter((e) => e.isDirectory()).length, files });
  }
  return results;
}

function toolDefinitions() {
  return [
    { name:"codeharborx_status", description:"Read CodeHarborX Desktop Agent, NAS, local AI and MCP status.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"list_projects", description:"List projects registered in CodeHarborX with source and backup status.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"backup_health", description:"Inspect CodeHarborX backup and restore-point health.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"scan_nas_backups", description:"Scan the dedicated CodeHarborX Project_Backups folders on the local NAS without modifying files.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"list_ai_agents", description:"List configured CodeHarborX AI agent records.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"list_workflows", description:"List CodeHarborX automation workflow records.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"list_local_models", description:"List Ollama models available locally on this Desktop Agent.", inputSchema:{type:"object",properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,destructiveHint:false} },
    { name:"create_project", description:"Create a CodeHarborX project registry record. This does not deploy or delete anything.", inputSchema:{type:"object",required:["name","sourceType","nasPath"],properties:{name:{type:"string"},sourceType:{type:"string",enum:["floot_github","floot","github","local"]},nasPath:{type:"string"},flootProjectId:{type:"string"},githubRepo:{type:"string"}},additionalProperties:false}, annotations:{readOnlyHint:false,destructiveHint:false} },
    { name:"record_backup_status", description:"Record which backup layers are present for a project and date. This changes CodeHarborX metadata but does not delete files.", inputSchema:{type:"object",required:["projectId","backupDate"],properties:{projectId:{type:"integer"},backupDate:{type:"string"},sourceCode:{type:"boolean"},databaseDump:{type:"boolean"},filesAssets:{type:"boolean"},githubSnapshot:{type:"boolean"},buildsInstallers:{type:"boolean"},restoreRecord:{type:"boolean"}},additionalProperties:false}, annotations:{readOnlyHint:false,destructiveHint:false} }
  ];
}

async function callMcpTool(name, args) {
  const config = await loadConfig();
  if (name === "codeharborx_status") {
    const ollama = await detectOllama();
    return { agentVersion: AGENT_VERSION, deviceName: os.hostname(), nasRoot: config.nasRoot, nasReachable: await pathExists(config.nasRoot), localAiStatus: ollama.status, localModels: ollama.models, mcpUrl: "http://127.0.0.1:" + MCP_PORT + "/mcp" };
  }
  if (name === "scan_nas_backups") return scanBackups(config.nasRoot);
  if (name === "list_local_models") return detectOllama();
  if (name === "list_projects") return agentControl(config, "list_projects", {});
  if (name === "backup_health") return agentControl(config, "backup_health", {});
  if (name === "list_ai_agents") return agentControl(config, "list_agents", {});
  if (name === "list_workflows") return agentControl(config, "list_workflows", {});
  if (name === "create_project") return agentControl(config, "create_project", args || {});
  if (name === "record_backup_status") return agentControl(config, "record_backup", args || {});
  throw new Error("Unknown MCP tool: " + name);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type":"application/json", "Content-Length":Buffer.byteLength(body), "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"content-type, authorization, mcp-session-id", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" });
  res.end(body);
}

function startMcpServer() {
  mcpServer = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"content-type, authorization, mcp-session-id", "Access-Control-Allow-Methods":"GET,POST,OPTIONS" }); return res.end(); }
    if (req.url !== "/mcp") return sendJson(res, 404, { error:"Not found" });
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type":"text/event-stream", "Cache-Control":"no-cache", "Connection":"keep-alive", "Access-Control-Allow-Origin":"*" });
      res.write(": CodeHarborX MCP stream\n\n");
      const keepAlive = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 15000);
      req.on("close", () => clearInterval(keepAlive));
      return;
    }
    if (req.method !== "POST") return sendJson(res, 405, { error:"Method not allowed" });
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
    req.on("end", async () => {
      let msg;
      try { msg = JSON.parse(raw || "{}"); } catch { return sendJson(res, 400, { error:"Invalid JSON" }); }
      const id = msg.id;
      if (!id && String(msg.method || "").startsWith("notifications/")) { res.writeHead(202); return res.end(); }
      try {
        if (msg.method === "initialize") return sendJson(res, 200, { jsonrpc:"2.0", id, result:{ protocolVersion:(msg.params && msg.params.protocolVersion) || "2025-06-18", capabilities:{tools:{listChanged:false}}, serverInfo:{name:"CodeHarborX",version:AGENT_VERSION} } });
        if (msg.method === "ping") return sendJson(res, 200, { jsonrpc:"2.0", id, result:{} });
        if (msg.method === "tools/list") return sendJson(res, 200, { jsonrpc:"2.0", id, result:{ tools:toolDefinitions() } });
        if (msg.method === "tools/call") {
          const name = msg.params && msg.params.name;
          const args = msg.params && msg.params.arguments ? msg.params.arguments : {};
          const result = await callMcpTool(name, args);
          return sendJson(res, 200, { jsonrpc:"2.0", id, result:{ content:[{type:"text",text:JSON.stringify(result,null,2)}], isError:false } });
        }
        return sendJson(res, 200, { jsonrpc:"2.0", id, error:{ code:-32601, message:"Method not found" } });
      } catch (error) {
        return sendJson(res, 200, { jsonrpc:"2.0", id, result:{ content:[{type:"text",text:error instanceof Error ? error.message : String(error)}], isError:true } });
      }
    });
  });
  mcpServer.listen(MCP_PORT, "127.0.0.1");
  mcpServer.on("error", () => { mcpServer = null; });
}

function sendUpdateStatus(state, extra = {}) {
  updateStatus = { state, ...extra };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update:status", updateStatus);
}

function setupAutoUpdater() {
  if (!app.isPackaged) { sendUpdateStatus("dev", { message: "Updates are checked in packaged builds." }); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking", { message: "Checking GitHub for updates…" }));
  autoUpdater.on("update-available", (info) => sendUpdateStatus("downloading", { version: info.version, message: "Downloading CodeHarborX " + info.version + "…" }));
  autoUpdater.on("update-not-available", (info) => sendUpdateStatus("current", { version: info.version, message: "You are up to date." }));
  autoUpdater.on("download-progress", (p) => sendUpdateStatus("downloading", { version: updateStatus.version, percent: Math.round(p.percent), message: "Downloading update… " + Math.round(p.percent) + "%" }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("ready", { version: info.version, message: "Update ready. Restart to install." }));
  autoUpdater.on("error", (error) => sendUpdateStatus("error", { message: error && error.message ? error.message : String(error) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 7000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120, height: 790, minWidth: 900, minHeight: 660,
    backgroundColor: "#03101f", title: "CodeHarborX Desktop Agent",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer.html"));
}

ipcMain.handle("config:get", async () => ensureConfig());
ipcMain.handle("config:save", async (_event, config) => { await saveConfig(config); return { ok:true }; });
ipcMain.handle("nas:test", async (_event, nasRoot) => ({ reachable: await pathExists(nasRoot) }));
ipcMain.handle("agent:connect", async (_event, config) => {
  if (!config.agentKey || !config.agentKey.trim()) throw new Error("Paste the pairing key from CodeHarborX first.");
  await saveConfig(config);
  return sendHeartbeat(config);
});
ipcMain.handle("backups:scan", async (_event, nasRoot) => scanBackups(nasRoot));
ipcMain.handle("nas:open", async (_event, nasRoot) => { const error = await shell.openPath(nasRoot); if (error) throw new Error(error); return {ok:true}; });
ipcMain.handle("ollama:check", async () => detectOllama());
ipcMain.handle("system:info", async () => ({ hostname:os.hostname(), platform:os.platform(), release:os.release(), arch:os.arch(), cpus:os.cpus().length, totalMemory:os.totalmem(), freeMemory:os.freemem(), mcpPort:MCP_PORT, mcpListening:Boolean(mcpServer), appVersion:app.getVersion(), updateStatus }));
ipcMain.handle("update:check", async () => { if (!app.isPackaged) return { state:"dev" }; await autoUpdater.checkForUpdates(); return updateStatus; });
ipcMain.handle("update:install", async () => { if (updateStatus.state !== "ready") return { ok:false, reason:"No downloaded update is ready." }; setImmediate(() => autoUpdater.quitAndInstall(false, true)); return { ok:true }; });

app.whenReady().then(async () => {
  await ensureConfig();
  startMcpServer();
  createWindow();
  setupAutoUpdater();
  heartbeatTimer = setInterval(async () => {
    const config = await loadConfig();
    if (!config.agentKey) return;
    try {
      const result = await sendHeartbeat(config);
      if (mainWindow) mainWindow.webContents.send("heartbeat:status", { ok:true, nasReachable:result.nasReachable, ollama:result.ollama, mcpListening:Boolean(mcpServer) });
    } catch (error) {
      if (mainWindow) mainWindow.webContents.send("heartbeat:status", { ok:false, error:error instanceof Error ? error.message : String(error) });
    }
  }, 60_000);
});

app.on("window-all-closed", () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (mcpServer) mcpServer.close();
  if (process.platform !== "darwin") app.quit();
});
