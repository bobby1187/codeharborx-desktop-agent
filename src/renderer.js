const $ = (id) => document.getElementById(id);
const server = $("server");
const nasRoot = $("nasRoot");
const agentKey = $("agentKey");
const statusText = $("statusText");
const statusDot = $("statusDot");
const log = $("log");
const deviceText = $("deviceText");

function writeLog(message) {
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  log.textContent = `${line}\n${log.textContent}`.trim();
}

function setStatus(text, mode = "warn") {
  statusText.textContent = text;
  statusDot.className = `dot ${mode}`;
}

function currentConfig(base = {}) {
  return {
    ...base,
    server: server.value.trim(),
    nasRoot: nasRoot.value.trim(),
    agentKey: agentKey.value.trim()
  };
}

(async () => {
  const config = await window.codeHarborX.getConfig();
  server.value = config.server || "https://codeharborx.floot.app";
  nasRoot.value = config.nasRoot || "\\\\10.0.0.132\\personal_folder\\Project_Backups";
  agentKey.value = config.agentKey || "";
  deviceText.textContent = `Device ID: ${config.deviceId}`;
  writeLog("Ready. Create a pairing key in CodeHarborX online, paste it here, then Test NAS and Connect.");
})();

$("testNas").addEventListener("click", async () => {
  try {
    setStatus("Testing NAS…");
    const result = await window.codeHarborX.testNas(nasRoot.value.trim());
    if (result.reachable) {
      setStatus("NAS reachable", "ok");
      writeLog(`NAS reachable: ${nasRoot.value.trim()}`);
    } else {
      setStatus("NAS unreachable", "bad");
      writeLog("NAS is not reachable. Make sure Windows can open the UGREEN share in File Explorer.");
    }
  } catch (error) {
    setStatus("NAS test failed", "bad");
    writeLog(error.message || String(error));
  }
});

$("connect").addEventListener("click", async () => {
  const button = $("connect");
  button.disabled = true;
  try {
    const oldConfig = await window.codeHarborX.getConfig();
    const config = currentConfig(oldConfig);
    setStatus("Connecting…");
    const result = await window.codeHarborX.connect(config);
    if (result.nasReachable) {
      setStatus("Online · NAS reachable", "ok");
      writeLog("Connected to CodeHarborX. NAS is reachable.");
    } else {
      setStatus("Online · NAS unreachable", "warn");
      writeLog("Connected to CodeHarborX, but the NAS is not reachable.");
    }
  } catch (error) {
    setStatus("Connection failed", "bad");
    writeLog(`Connection failed: ${error.message || error}`);
  } finally {
    button.disabled = false;
  }
});

$("scan").addEventListener("click", async () => {
  try {
    const results = await window.codeHarborX.scanBackups(nasRoot.value.trim());
    writeLog("Backup scan complete:");
    for (const item of results) {
      writeLog(`${item.category}: ${item.exists ? `${item.projects} project folder(s)` : "missing"}`);
    }
  } catch (error) {
    writeLog(`Backup scan failed: ${error.message || error}`);
  }
});

$("openNas").addEventListener("click", async () => {
  try {
    await window.codeHarborX.openNas(nasRoot.value.trim());
    writeLog("Opened NAS backup root.");
  } catch (error) {
    writeLog(`Could not open NAS: ${error.message || error}`);
  }
});

window.codeHarborX.onHeartbeat((status) => {
  if (status.ok && status.nasReachable) setStatus("Online · NAS reachable", "ok");
  else if (status.ok) setStatus("Online · NAS unreachable", "warn");
  else setStatus("Offline", "bad");
});
