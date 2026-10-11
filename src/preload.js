const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codeHarborX", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  getSnapshot: () => ipcRenderer.invoke("platform:snapshot"),
  addProject: (input) => ipcRenderer.invoke("platform:add-project", input),
  recordBackup: (input) => ipcRenderer.invoke("platform:record-backup", input),
  addActivity: (message) => ipcRenderer.invoke("platform:add-activity", message),
  testNas: (nasRoot) => ipcRenderer.invoke("nas:test", nasRoot),
  scanBackups: (nasRoot) => ipcRenderer.invoke("nas:scan", nasRoot),
  openNas: (nasRoot) => ipcRenderer.invoke("nas:open", nasRoot),
  checkOllama: () => ipcRenderer.invoke("ollama:check"),
  openLocalControls: () => ipcRenderer.invoke("window:open-local-controls"),
  openDataFolder: () => ipcRenderer.invoke("system:open-data-folder"),
  systemInfo: () => ipcRenderer.invoke("system:info"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (callback) => ipcRenderer.on("update:status", (_event, status) => callback(status)),
  onPlatformStatus: (callback) => ipcRenderer.on("platform:status", (_event, status) => callback(status))
});
