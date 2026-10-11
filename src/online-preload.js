const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codeHarborXDesktop", {
  openLocalControls: () => ipcRenderer.invoke("window:open-local-controls"),
  systemInfo: () => ipcRenderer.invoke("system:info"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (callback) => ipcRenderer.on("update:status", (_event, status) => callback(status))
});
