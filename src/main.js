const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const AGENT_VERSION = "0.1.0";
let mainWindow = null;
let heartbeatTimer = null;

function configPath() {
  return path.join(app.getPath("userData"), "agent-config.json");
}

async function loadConfig() {
  try {
    return JSON.parse(await fsp.readFile(configPath(), "utf8"));
  } catch {
    return {
      server: "https://codeharborx.floot.app",
      nasRoot: "\\\\10.0.0.132\\personal_folder\\Project_Backups",
      agentKey: "",
      deviceId: crypto.randomUUID()
    };
  }
}

async function saveConfig(config) {
  await fsp.mkdir(path.dirname(configPath()), { recursive: true });
  await fsp.writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

async function ensureDeviceId(config) {
  if (!config.deviceId) {
    config.deviceId = crypto.randomUUID();
    await saveConfig(config);
  }
  return config;
}

async function pathExists(target) {
  try {
    await fsp.access(target, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function sendHeartbeat(config) {
  config = await ensureDeviceId(config);
  const nasReachable = await pathExists(config.nasRoot);
  const body = {
    json: {
      deviceId: config.deviceId,
      deviceName: os.hostname(),
      version: AGENT_VERSION,
      nasReachable
    }
  };

  const response = await fetch(`${config.server.replace(/\\/+$/, "")}/_api/agent/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.agentKey}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = {}; }
  const data = parsed?.json ?? parsed;

  if (!response.ok) {
    throw new Error(data?.error || `CodeHarborX returned HTTP ${response.status}`);
  }

  return { nasReachable, data };
}

async function scanBackups(nasRoot) {
  if (!(await pathExists(nasRoot))) {
    throw new Error("NAS path is not reachable.");
  }

  const categories = [
    "Floot_Exports",
    "Database_Backups",
    "Files_and_Assets",
    "GitHub_Snapshots",
    "Builds_and_Installers",
    "Restore_Points"
  ];

  const results = [];
  for (const category of categories) {
    const categoryPath = path.join(nasRoot, category);
    const exists = await pathExists(categoryPath);
    if (!exists) {
      results.push({ category, exists: false, projects: 0 });
      continue;
    }
    const entries = await fsp.readdir(categoryPath, { withFileTypes: true });
    results.push({
      category,
      exists: true,
      projects: entries.filter((e) => e.isDirectory()).length
    });
  }
  return results;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 780,
    minHeight: 620,
    backgroundColor: "#071318",
    title: "CodeHarborX Desktop Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer.html"));
}

ipcMain.handle("config:get", async () => ensureDeviceId(await loadConfig()));
ipcMain.handle("config:save", async (_event, config) => {
  await saveConfig(config);
  return { ok: true };
});
ipcMain.handle("nas:test", async (_event, nasRoot) => ({
  reachable: await pathExists(nasRoot)
}));
ipcMain.handle("agent:connect", async (_event, config) => {
  if (!config.agentKey || !config.agentKey.trim()) {
    throw new Error("Paste the pairing key from CodeHarborX first.");
  }
  await saveConfig(config);
  return sendHeartbeat(config);
});
ipcMain.handle("backups:scan", async (_event, nasRoot) => scanBackups(nasRoot));
ipcMain.handle("nas:open", async (_event, nasRoot) => {
  const error = await shell.openPath(nasRoot);
  if (error) throw new Error(error);
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();

  heartbeatTimer = setInterval(async () => {
    const config = await loadConfig();
    if (!config.agentKey) return;
    try {
      const result = await sendHeartbeat(config);
      mainWindow?.webContents.send("heartbeat:status", {
        ok: true,
        nasReachable: result.nasReachable
      });
    } catch (error) {
      mainWindow?.webContents.send("heartbeat:status", {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, 60_000);
});

app.on("window-all-closed", () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (process.platform !== "darwin") app.quit();
});
