const $ = (id) => document.getElementById(id);
const server = $("server");
const nasRoot = $("nasRoot");
const agentKey = $("agentKey");
const statusText = $("statusText");
const statusDot = $("statusDot");
const dashboardLog = $("dashboardLog");
const deviceText = $("deviceText");
let currentTheme = "dark";

function writeLog(message) {
  const line = new Date().toLocaleTimeString() + "  " + message;
  dashboardLog.textContent = (line + "\n" + dashboardLog.textContent).trim();
}
function setStatus(text, mode) {
  statusText.textContent = text;
  statusDot.className = "dot " + (mode || "warn");
  $("sideStatus").textContent = text;
  $("metricCloud").textContent = text;
}
async function saveCurrentConfig() {
  const old = await window.codeHarborX.getConfig();
  await window.codeHarborX.saveConfig({
    ...old,
    server: server.value.trim(),
    nasRoot: nasRoot.value.trim(),
    agentKey: agentKey.value.trim(),
    theme: currentTheme
  });
}
function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = currentTheme;
  $("themeDark").classList.toggle("active", currentTheme === "dark");
  $("themeLight").classList.toggle("active", currentTheme === "light");
}
function renderBackupResults(items) {
  $("backupResults").innerHTML = "";
  for (const item of items) {
    const el = document.createElement("div");
    el.className = "result";
    el.innerHTML = "<b>" + item.category + "</b><span>" + (item.exists ? item.projects + " project folder(s) · " + item.files + " item(s)" : "Folder missing") + "</span>";
    $("backupResults").appendChild(el);
  }
}
function renderModels(result) {
  const state = $("ollamaState");
  const list = $("modelList");
  list.innerHTML = "";
  if (result.status === "online") {
    state.className = "state-banner good";
    state.textContent = "Ollama is online · " + result.models.length + " local model(s) detected";
    $("metricAi").textContent = "Online";
    $("metricAiDetail").textContent = result.models.length + " model(s) available";
    for (const model of result.models) {
      const el = document.createElement("div");
      el.className = "model-item";
      el.textContent = model;
      list.appendChild(el);
    }
  } else {
    state.className = "state-banner bad";
    state.textContent = "Ollama is not reachable on 127.0.0.1:11434";
    $("metricAi").textContent = "Offline";
    $("metricAiDetail").textContent = "No local runtime detected";
  }
}
async function refreshSystem() {
  const info = await window.codeHarborX.systemInfo();
  $("mcpState").textContent = info.mcpListening ? "Listening" : "Offline";
  $("metricMcp").textContent = info.mcpListening ? "Listening" : "Offline";
  $("mcpUrl").textContent = "http://127.0.0.1:" + info.mcpPort + "/mcp";
  $("currentVersion").textContent = "v" + info.appVersion;
  if (info.updateStatus && info.updateStatus.message) $("updateStatus").textContent = info.updateStatus.message;
  const rows = [
    ["Device", info.hostname],["Platform", info.platform + " " + info.release],["Architecture", info.arch],
    ["CPU threads", String(info.cpus)],["Memory", (info.totalMemory/1073741824).toFixed(1) + " GB"],["MCP port", String(info.mcpPort)]
  ];
  $("systemGrid").innerHTML = "";
  for (const row of rows) {
    const el = document.createElement("div");
    el.className = "system-item";
    el.innerHTML = "<span>" + row[0] + "</span><b>" + row[1] + "</b>";
    $("systemGrid").appendChild(el);
  }
}
async function testNas() {
  try {
    const result = await window.codeHarborX.testNas(nasRoot.value.trim());
    if (result.reachable) {
      $("metricNas").textContent = "Reachable";
      writeLog("NAS reachable: " + nasRoot.value.trim());
      return true;
    }
    $("metricNas").textContent = "Unreachable";
    writeLog("NAS is not reachable. Make sure Windows can open the UGREEN share.");
    return false;
  } catch (error) {
    $("metricNas").textContent = "Error";
    writeLog("NAS test failed: " + (error.message || error));
    return false;
  }
}
async function connectAgent() {
  try {
    await saveCurrentConfig();
    setStatus("Connecting…", "warn");
    const cfg = await window.codeHarborX.getConfig();
    const result = await window.codeHarborX.connect(cfg);
    if (result.nasReachable) {
      setStatus("Online · NAS reachable", "ok");
      $("metricNas").textContent = "Reachable";
      writeLog("Connected to CodeHarborX. NAS is reachable.");
    } else {
      setStatus("Online · NAS issue", "warn");
      $("metricNas").textContent = "Unreachable";
      writeLog("Connected to CodeHarborX, but the NAS is not reachable.");
    }
    renderModels(result.ollama);
  } catch (error) {
    setStatus("Connection failed", "bad");
    writeLog("Connection failed: " + (error.message || error));
  }
}
async function scanBackups() {
  try {
    const items = await window.codeHarborX.scanBackups(nasRoot.value.trim());
    renderBackupResults(items);
    writeLog("Backup scan completed across " + items.length + " categories.");
  } catch (error) {
    writeLog("Backup scan failed: " + (error.message || error));
  }
}
async function checkOllama() {
  const result = await window.codeHarborX.checkOllama();
  renderModels(result);
  writeLog("Local AI check: " + result.status + " · " + result.models.length + " model(s).");
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".section").forEach((x) => x.classList.remove("active"));
    button.classList.add("active");
    $(button.dataset.section).classList.add("active");
    $("pageTitle").textContent = button.textContent;
  });
});

$("themeDark").addEventListener("click", async () => { applyTheme("dark"); await saveCurrentConfig(); });
$("themeLight").addEventListener("click", async () => { applyTheme("light"); await saveCurrentConfig(); });
$("testNas").addEventListener("click", testNas);
$("quickTestNas").addEventListener("click", testNas);
$("connect").addEventListener("click", connectAgent);
$("quickConnect").addEventListener("click", connectAgent);
$("scan").addEventListener("click", scanBackups);
$("quickScan").addEventListener("click", scanBackups);
$("checkOllama").addEventListener("click", checkOllama);
$("quickOllama").addEventListener("click", checkOllama);
$("checkUpdates").addEventListener("click", async () => { try { $("updateStatus").textContent = "Checking for updates…"; await window.codeHarborX.checkForUpdates(); } catch (error) { $("updateStatus").textContent = error.message || String(error); } });
$("installUpdate").addEventListener("click", async () => { await window.codeHarborX.installUpdate(); });
window.codeHarborX.onUpdateStatus((status) => { $("updateStatus").textContent = status.message || status.state; $("installUpdate").style.display = status.state === "ready" ? "" : "none"; if (status.state === "ready") writeLog("Update " + status.version + " is ready to install."); });

$("openNas").addEventListener("click", async () => {
  try { await window.codeHarborX.openNas(nasRoot.value.trim()); writeLog("Opened NAS backup root."); }
  catch (error) { writeLog("Could not open NAS: " + (error.message || error)); }
});

window.codeHarborX.onHeartbeat((status) => {
  if (status.ok && status.nasReachable) setStatus("Online · NAS reachable", "ok");
  else if (status.ok) setStatus("Online · NAS issue", "warn");
  else setStatus("Offline", "bad");
  if (status.ollama) renderModels(status.ollama);
  $("metricMcp").textContent = status.mcpListening ? "Listening" : "Offline";
});

(async () => {
  const config = await window.codeHarborX.getConfig();
  server.value = config.server || "https://codeharborx.floot.app";
  nasRoot.value = config.nasRoot || "\\10.0.0.132\personal_folder\Project_Backups";
  agentKey.value = config.agentKey || "";
  deviceText.textContent = "Device ID: " + config.deviceId;
  applyTheme(config.theme || "dark");
  await refreshSystem();
  await checkOllama();
  if (config.agentKey) {
    writeLog("Saved pairing detected. Click Connect to refresh the CodeHarborX session.");
    $("metricCloud").textContent = "Paired";
  } else {
    writeLog("Create a pairing key in CodeHarborX → Desktop Agents, paste it here, then connect.");
  }
})();