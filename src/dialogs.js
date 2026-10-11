const path = require('node:path');
function createDialogs({ BrowserWindow, ipcMain, directory = __dirname }) {
  const pending = new Map();
  ipcMain.handle('dialog:details', event => {
    const entry = pending.get(event.sender.id);
    if (!entry || event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown dialog.');
    return entry.details;
  });
  ipcMain.handle('dialog:answer', (event, confirmed) => {
    const entry = pending.get(event.sender.id);
    if (!entry || event.senderFrame !== event.sender.mainFrame) return;
    entry.finish(confirmed === true);
  });
  return {
    confirm(parent, details) {
      return new Promise(resolve => {
        const win = new BrowserWindow({ width: 560, height: 380, resizable: false, minimizable: false,
          maximizable: false, frame: false, show: false, modal: Boolean(parent), parent,
          title: 'CodeHarborX', backgroundColor: details.theme === 'light' ? '#f4f8fc' : '#050b14',
          icon: path.join(directory, '..', 'build', 'icon.png'),
          webPreferences: { preload: path.join(directory, 'dialog-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
        let settled = false;
        const senderId = win.webContents.id;
        const finish = value => { if (settled) return; settled = true; pending.delete(senderId); resolve(value); if (!win.isDestroyed()) win.destroy(); };
        pending.set(senderId, { details, finish });
        win.on('closed', () => finish(false));
        win.webContents.on('will-navigate', event => event.preventDefault());
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.once('ready-to-show', () => win.show());
        win.loadFile(path.join(directory, 'dialog.html')).catch(() => finish(false));
      });
    }
  };
}
module.exports = { createDialogs };
