const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codeHarborX", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  testNas: (nasRoot) => ipcRenderer.invoke("nas:test", nasRoot),
  connect: (config) => ipcRenderer.invoke("agent:connect", config),
  scanBackups: (nasRoot) => ipcRenderer.invoke("backups:scan", nasRoot),
  openNas: (nasRoot) => ipcRenderer.invoke("nas:open", nasRoot),
  checkOllama: () => ipcRenderer.invoke("ollama:check"),
  systemInfo: () => ipcRenderer.invoke("system:info"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (callback) => ipcRenderer.on("update:status", (_event, status) => callback(status)),
  onHeartbeat: (callback) => ipcRenderer.on("heartbeat:status", (_event, status) => callback(status))
});
