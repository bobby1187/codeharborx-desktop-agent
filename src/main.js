const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const { createBuilder } = require("./builder");
const { createPackaging } = require('./packaging');
let packaging = null;
const { TunnelManager } = require("./tunnel");
const { removeRecord } = require('./records');
const { createDialogs } = require('./dialogs');
const dialogs = createDialogs({ BrowserWindow, ipcMain });
let tunnel = null;
let quitReady = false;
let quitPending = false;

const APP_VERSION = app.getVersion();
const MCP_PORT = 48321;
let mainWindow = null;
let localWindow = null;
let statusTimer = null;
let mcpServer = null;
let builder = null;
let updateStatus = { state: "idle", version: null, message: "Automatic GitHub updates enabled" };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function dataPath() {
  return path.join(app.getPath("userData"), "platform-data.json");
}

function defaultConfig() {
  return {
    nasRoot: "\\\\10.0.0.132\\personal_folder\\Project_Backups",
    deviceId: crypto.randomUUID(),
    theme: "dark"
  };
}

function defaultData() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    createdAt: now,
    projects: [],
    agents: [
      { id: "architect", name: "Project Architect", specialty: "Planning & architecture", provider: "local/cloud", model: "Selectable", status: "ready" },
      { id: "backup-guardian", name: "Backup Guardian", specialty: "Backup verification", provider: "local", model: "Rules + AI", status: "ready" },
      { id: "release-builder", name: "Release Builder", specialty: "Packaging & releases", provider: "local", model: "Automation", status: "ready" },
      { id: "code-reviewer", name: "Code Reviewer", specialty: "Code quality", provider: "local/cloud", model: "Selectable", status: "ready" }
    ],
    workflows: [
      { id: "backup-verify", name: "Backup verification", status: "active", description: "Scan the CodeHarborX backup root and verify recovery layers." },
      { id: "release-build", name: "Release build", status: "ready", description: "Prepare a Windows release and updater metadata through GitHub Actions." },
      { id: "restore-check", name: "Restore-point check", status: "ready", description: "Review the latest restore record for registered projects." }
    ],
    extensions: [
      { id: "github", name: "GitHub", enabled: true },
      { id: "ollama", name: "Ollama", enabled: true },
      { id: "nas", name: "UGREEN NAS", enabled: true },
      { id: "mcp", name: "MCP Bridge", enabled: true }
    ],
    knowledge: [],
    assets: [],
    deployments: [],
    team: [{ id: "owner", name: "Owner", role: "Administrator" }],
    activity: [{ id: crypto.randomUUID(), at: now, message: "Standalone CodeHarborX data store initialized." }]
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

async function loadConfig() {
  const existing = await readJson(configPath(), {});
  const base = defaultConfig();
  const config = {
    nasRoot: existing.nasRoot || base.nasRoot,
    deviceId: existing.deviceId || base.deviceId,
    theme: existing.theme === "light" ? "light" : "dark"
  };
  await writeJson(configPath(), config);
  return config;
}

async function saveConfig(input) {
  const current = await loadConfig();
  const next = {
    nasRoot: String(input?.nasRoot || current.nasRoot).trim(),
    deviceId: current.deviceId,
    theme: input?.theme === "light" ? "light" : "dark"
  };
  await writeJson(configPath(), next);
  return next;
}

async function loadData() {
  const existing = await readJson(dataPath(), null);
  if (existing && Array.isArray(existing.projects)) return existing;
  const seeded = defaultData();
  await writeJson(dataPath(), seeded);
  return seeded;
}

async function saveData(data) {
  await writeJson(dataPath(), data);
  return data;
}

async function addActivity(message) {
  const data = await loadData();
  data.activity = Array.isArray(data.activity) ? data.activity : [];
  data.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), message });
  data.activity = data.activity.slice(0, 250);
  await saveData(data);
}

async function pathExists(target) {
  try {
    await fsp.access(target, fs.constants.F_OK);
    return true;
  } catch {
    return false;
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

async function scanBackups(nasRoot) {
  if (!(await pathExists(nasRoot))) throw new Error("NAS path is not reachable.");
  const categories = [
    { category: "Source_Exports", folders: ["Source_Exports", "Floot_Exports"] },
    { category: "Database_Backups", folders: ["Database_Backups"] },
    { category: "Files_and_Assets", folders: ["Files_and_Assets"] },
    { category: "GitHub_Snapshots", folders: ["GitHub_Snapshots"] },
    { category: "Builds_and_Installers", folders: ["Builds_and_Installers"] },
    { category: "Restore_Points", folders: ["Restore_Points"] }
  ];
  const results = [];
  for (const item of categories) {
    const category = item.category;
    let categoryPath = path.join(nasRoot, item.folders[0]);
    let exists = await pathExists(categoryPath);
    if (!exists && item.folders.length > 1) {
      const legacyPath = path.join(nasRoot, item.folders[1]);
      if (await pathExists(legacyPath)) { categoryPath = legacyPath; exists = true; }
    }
    if (!exists) {
      results.push({ category, exists: false, projects: 0, files: 0 });
      continue;
    }
    const entries = await fsp.readdir(categoryPath, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory());
    let files = entries.filter((entry) => entry.isFile()).length;
    for (const folder of folders) {
      try {
        files += (await fsp.readdir(path.join(categoryPath, folder.name))).length;
      } catch {}
    }
    results.push({ category, exists: true, projects: folders.length, files });
  }
  return results;
}

function projectStatus(project) {
  const s = project.latestSnapshot;
  if (!s) return project.githubRepo ? "needs_backup" : "setup";
  const layers = [s.sourceCode, s.databaseDump, s.filesAssets, s.githubSnapshot, s.buildsInstallers, s.restoreRecord].filter(Boolean).length;
  return layers === 6 ? "protected" : "needs_backup";
}

async function createProject(input) {
  if (!input?.name || !String(input.name).trim()) throw new Error("Project name is required.");
  const data = await loadData();
  const project = {
    id: crypto.randomUUID(),
    name: String(input.name).trim(),
    sourceType: input.sourceType || "local",
    githubRepo: String(input.githubRepo || "").trim(),
    localPath: String(input.localPath || "").trim(),
    nasPath: String(input.nasPath || "").trim(),
    createdAt: new Date().toISOString(),
    lastBackupAt: null,
    latestSnapshot: null
  };
  data.projects.unshift(project);
  data.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), message: "Project added: " + project.name });
  await saveData(data);
  return project;
}

async function recordBackup(input) {
  const data = await loadData();
  const project = data.projects.find((p) => String(p.id) === String(input?.projectId));
  if (!project) throw new Error("Project not found.");
  const backupDate = input.backupDate || new Date().toISOString();
  project.latestSnapshot = {
    backupDate,
    sourceCode: Boolean(input.sourceCode),
    databaseDump: Boolean(input.databaseDump),
    filesAssets: Boolean(input.filesAssets),
    githubSnapshot: Boolean(input.githubSnapshot),
    buildsInstallers: Boolean(input.buildsInstallers),
    restoreRecord: Boolean(input.restoreRecord)
  };
  project.lastBackupAt = backupDate;
  data.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), message: "Backup status recorded: " + project.name });
  await saveData(data);
  return project;
}

async function platformSnapshot() {
  const [config, data, ollama] = await Promise.all([loadConfig(), loadData(), detectOllama()]);
  const nasReachable = await pathExists(config.nasRoot);
  const projects = data.projects.map((p) => ({ ...p, status: projectStatus(p) }));
  return {
    appVersion: APP_VERSION,
    deviceName: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    config,
    data: { ...data, projects },
    nasReachable,
    ollama,
    mcpListening: Boolean(mcpServer),
    mcpPort: MCP_PORT,
    updateStatus,
    tunnel: tunnel ? await tunnel.view() : { state: 'disconnected' }
  };
}

function toolDefinitions() {
  return [
    { name: "codeharborx_status", description: "Read local CodeHarborX status.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "list_projects", description: "List projects in the standalone CodeHarborX project registry.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "backup_health", description: "Inspect local backup and restore-point health.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "scan_nas_backups", description: "Scan the configured CodeHarborX NAS backup root without modifying files.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "list_ai_agents", description: "List standalone CodeHarborX AI agent records.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "list_workflows", description: "List standalone CodeHarborX workflow records.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "list_local_models", description: "List Ollama models available on this computer.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: "create_project", description: "Create a local CodeHarborX project record.", inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, sourceType: { type: "string" }, githubRepo: { type: "string" }, localPath: { type: "string" }, nasPath: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: "record_backup_status", description: "Record backup-layer status for a local project.", inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" }, backupDate: { type: "string" }, sourceCode: { type: "boolean" }, databaseDump: { type: "boolean" }, filesAssets: { type: "boolean" }, githubSnapshot: { type: "boolean" }, buildsInstallers: { type: "boolean" }, restoreRecord: { type: "boolean" } }, additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
    ...(builder ? builder.tools() : [])
  ];
}

async function callMcpTool(name, args) {
  if (builder && String(name || "").startsWith("builder_")) return builder.callTool(name, args || {});
  const config = await loadConfig();
  if (name === "codeharborx_status") return platformSnapshot();
  if (name === "scan_nas_backups") return scanBackups(config.nasRoot);
  if (name === "list_local_models") return detectOllama();
  if (name === "list_projects") return (await platformSnapshot()).data.projects;
  if (name === "backup_health") {
    const projects = (await platformSnapshot()).data.projects;
    return projects.map((p) => ({ id: p.id, name: p.name, status: p.status, lastBackupAt: p.lastBackupAt, latestSnapshot: p.latestSnapshot }));
  }
  if (name === "list_ai_agents") return (await loadData()).agents;
  if (name === "list_workflows") return (await loadData()).workflows;
  if (name === "create_project") return createProject(args || {});
  if (name === "record_backup_status") return recordBackup(args || {});
  throw new Error("Unknown MCP tool: " + name);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(body);
}

function startMcpServer() {
  mcpServer = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
      return res.end();
    }
    if (req.url !== "/mcp") return sendJson(res, 404, { error: "Not found" });
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" });
      res.write(": CodeHarborX MCP stream\n\n");
      const keepAlive = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 15000);
      req.on("close", () => clearInterval(keepAlive));
      return;
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy();
    });
    req.on("end", async () => {
      let msg;
      try { msg = JSON.parse(raw || "{}"); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
      const id = msg.id;
      if (!id && String(msg.method || "").startsWith("notifications/")) {
        res.writeHead(202);
        return res.end();
      }
      try {
        if (msg.method === "initialize") return sendJson(res, 200, { jsonrpc: "2.0", id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "CodeHarborX", version: APP_VERSION } } });
        if (msg.method === "ping") return sendJson(res, 200, { jsonrpc: "2.0", id, result: {} });
        if (msg.method === "tools/list") return sendJson(res, 200, { jsonrpc: "2.0", id, result: { tools: toolDefinitions() } });
        if (msg.method === "tools/call") {
          const result = await callMcpTool(msg.params?.name, msg.params?.arguments || {});
          return sendJson(res, 200, { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false } });
        }
        return sendJson(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
      } catch (error) {
        return sendJson(res, 200, { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true } });
      }
    });
  });
  mcpServer.listen(MCP_PORT, "127.0.0.1");
  mcpServer.on("error", () => { mcpServer = null; });
}

function broadcast(channel, payload) {
  for (const win of [mainWindow, localWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function sendUpdateStatus(state, extra = {}) {
  updateStatus = { state, ...extra };
  broadcast("update:status", updateStatus);
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    sendUpdateStatus("dev", { message: "Updates are checked in packaged builds." });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking", { message: "Checking GitHub for updates…" }));
  autoUpdater.on("update-available", (info) => sendUpdateStatus("downloading", { version: info.version, message: "Downloading CodeHarborX " + info.version + "…" }));
  autoUpdater.on("update-not-available", (info) => sendUpdateStatus("current", { version: info.version, message: "You are up to date." }));
  autoUpdater.on("download-progress", (p) => sendUpdateStatus("downloading", { version: updateStatus.version, percent: Math.round(p.percent), message: "Downloading update… " + Math.round(p.percent) + "%" }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("ready", { version: info.version, message: "Update ready. Restart to install." }));
  autoUpdater.on("error", (error) => sendUpdateStatus("error", { message: error?.message || String(error) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 7000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

function windowOptions(title) {
  return {
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#03101f",
    title,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow(windowOptions("CodeHarborX"));
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "app.html"));
  mainWindow.on('close', event => {
    if (packaging && packaging.isBusy()) {
      event.preventDefault();
      mainWindow.webContents.send('packaging:status', { ...packaging.view(), message:'A package is still building. Wait for it to finish before closing CodeHarborX.' });
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function createLocalWindow() {
  if (localWindow && !localWindow.isDestroyed()) {
    if (localWindow.isMinimized()) localWindow.restore();
    localWindow.show();
    localWindow.focus();
    return;
  }
  localWindow = new BrowserWindow({ ...windowOptions("CodeHarborX Local Controls"), width: 1180, height: 820 });
  localWindow.removeMenu();
  localWindow.loadFile(path.join(__dirname, "app.html"), { hash: "desktop-agents" });
  localWindow.on("closed", () => { localWindow = null; });
}

ipcMain.handle('packaging:status', event => { requireLocalUI(event); return packaging.view(); });
ipcMain.handle('packaging:select', async event => {
  requireLocalUI(event);
  if (packaging.isBusy()) throw new Error('Wait for the current package to finish.');
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title:'Select a built web project', properties:['openDirectory'] });
  return result.canceled ? packaging.view() : packaging.select(result.filePaths[0]);
});
ipcMain.handle('packaging:build', (event, input) => { requireLocalUI(event); return packaging.build(input || {}); });
ipcMain.handle('packaging:reveal', (event, index) => { requireLocalUI(event); return packaging.reveal(index); });
app.on('before-quit', event => {
  if (packaging && packaging.isBusy()) {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('packaging:status', { ...packaging.view(), message:'A package is still building. Wait for it to finish before quitting.' });
  }
});

ipcMain.handle("config:get", async () => loadConfig());
function requireLocalUI(event) {
  const expected = require('url').pathToFileURL(path.join(__dirname, 'app.html')).href;
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split('#')[0] !== expected) throw new Error('Only the CodeHarborX app can request this action.');
}
async function confirmDelete(event, name, detail) {
  requireLocalUI(event);
  return dialogs.confirm(BrowserWindow.fromWebContents(event.sender), {
    title: `Delete ${name}?`, detail, theme: (await loadConfig()).theme
  });
}
ipcMain.handle('builder:delete-project', async (event, id) => {
  requireLocalUI(event);
  const { info } = await builder.deletionTarget(id);
  if (!(await confirmDelete(event, info.name, 'This moves the Builder project and all its files to the Windows Recycle Bin and stops its preview.'))) return { canceled: true };
  return builder.deleteProject(id);
});
ipcMain.handle('builder:delete-file', async (event, id, rel) => {
  requireLocalUI(event); await builder.deletionTarget(id, rel);
  if (!(await confirmDelete(event, rel, 'This moves the file to the Windows Recycle Bin. Any unsaved edits to this file will be discarded.'))) return { canceled: true };
  return builder.deleteFile(id, rel);
});
ipcMain.handle('platform:delete-record', async (event, collection, id) => {
  requireLocalUI(event);
  const { record } = removeRecord(await loadData(), collection, id);
  if (!(await confirmDelete(event, record.name || record.title || 'this record', 'This removes the saved record from CodeHarborX. Source files, GitHub repositories, NAS backups and external services are kept.'))) return { canceled: true };
  const { data } = removeRecord(await loadData(), collection, id);
  await saveData(data); return { ok: true };
});
function tunnelHandler(channel, action) {
  ipcMain.handle(channel, async (event, input) => {
    const expected = require('url').pathToFileURL(path.join(__dirname, 'app.html')).href;
    if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split('#')[0] !== expected) throw new Error('Untrusted tunnel request.');
    try { return await action(input); } catch { throw new Error('Tunnel operation failed. Check the executable, profile and secure credential.'); }
  });
}
tunnelHandler('tunnel:configure', input => tunnel.configure(input || {}));
tunnelHandler('tunnel:forget', () => tunnel.forget());
tunnelHandler('tunnel:start', () => tunnel.start());
tunnelHandler('tunnel:stop', () => tunnel.stop());
tunnelHandler('tunnel:restart', () => tunnel.restart());
tunnelHandler('tunnel:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Select the official tunnel-client executable', filters: [{ name: 'Windows executable', extensions: ['exe'] }], properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("config:save", async (_event, input) => saveConfig(input));
ipcMain.handle("platform:snapshot", async () => platformSnapshot());
ipcMain.handle("platform:add-project", async (_event, input) => createProject(input));
ipcMain.handle("platform:record-backup", async (_event, input) => recordBackup(input));
ipcMain.handle("platform:add-activity", async (_event, message) => { await addActivity(String(message || "")); return { ok: true }; });
ipcMain.handle("nas:test", async (_event, nasRoot) => ({ reachable: await pathExists(nasRoot) }));
ipcMain.handle("nas:scan", async (_event, nasRoot) => scanBackups(nasRoot));
ipcMain.handle("nas:open", async (_event, nasRoot) => {
  const error = await shell.openPath(nasRoot);
  if (error) throw new Error(error);
  return { ok: true };
});
ipcMain.handle("ollama:check", async () => detectOllama());
ipcMain.handle("builder:status", async () => builder.status());
ipcMain.handle("builder:create", async (_event, input) => builder.createProject(input || {}));
ipcMain.handle("builder:list-files", async (_event, projectId) => builder.listFiles(projectId));
ipcMain.handle("builder:read-file", async (_event, projectId, filePath) => builder.readFile(projectId, filePath));
ipcMain.handle("builder:write-file", async (_event, projectId, filePath, content) => builder.writeFile(projectId, filePath, content));
ipcMain.handle("builder:generate", async (_event, input) => builder.generate(input || {}));
ipcMain.handle("builder:start-preview", async (_event, projectId) => builder.startPreview(projectId));
ipcMain.handle("builder:stop-preview", async (_event, projectId) => builder.stopPreview(projectId));
ipcMain.handle("builder:open-folder", async (_event, projectId) => builder.openFolder(projectId));
ipcMain.handle("window:open-local-controls", async () => { createLocalWindow(); return { ok: true }; });
ipcMain.handle("system:open-data-folder", async () => {
  const error = await shell.openPath(app.getPath("userData"));
  if (error) throw new Error(error);
  return { ok: true };
});
ipcMain.handle("system:info", async () => platformSnapshot());
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return { state: "dev" };
  await autoUpdater.checkForUpdates();
  return updateStatus;
});
ipcMain.handle("update:install", async () => {
  if (updateStatus.state !== "ready") return { ok: false, reason: "No downloaded update is ready." };
  setImmediate(async () => { if (tunnel) await tunnel.stop(); autoUpdater.quitAndInstall(true, true); });
  return { ok: true };
});

app.whenReady().then(async () => {
  packaging = createPackaging({ directory: path.join(app.getPath('userData'), 'packaging'), notify: status => broadcast('packaging:status', status), openPath: folder => shell.openPath(folder) });
  await packaging.init();
  builder = createBuilder({ userDataPath: app.getPath("userData"), shell });
  await loadConfig();
  await loadData();
  startMcpServer();
  tunnel = new TunnelManager({ directory: path.join(app.getPath('userData'), 'tunnel'), safeStorage,
    host: app.isPackaged ? path.join(process.resourcesPath, 'tunnel-host.exe') : path.join(__dirname, '..', 'build', 'tunnel-host.exe'),
    notify: status => broadcast('tunnel:status', status) });
  await tunnel.init();
  createMainWindow();
  if (tunnel.config.autoStart) await tunnel.start();
  setupAutoUpdater();
  statusTimer = setInterval(async () => {
    try {
      broadcast("platform:status", await platformSnapshot());
    } catch {}
  }, 60_000);
});

app.on('before-quit', event => {
  if (quitReady || !tunnel) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  tunnel.stop().finally(() => { quitReady = true; app.quit(); });
});

app.on("window-all-closed", () => {
  if (statusTimer) clearInterval(statusTimer);
  if (mcpServer) mcpServer.close();
  if (builder) builder.closeAll();
  if (process.platform !== "darwin") app.quit();
});
