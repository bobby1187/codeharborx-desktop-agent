const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('harborDialog', {
  details: () => ipcRenderer.invoke('dialog:details'),
  answer: confirmed => ipcRenderer.invoke('dialog:answer', confirmed)
});
