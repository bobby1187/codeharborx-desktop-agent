// Run with Electron after the native supervisor is built. Uses synthetic credentials only.
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { TunnelManager } = require('../src/tunnel');
app.whenReady().then(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeharborx-electron-'));
  let win;
  try {
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    const manager = new TunnelManager({ directory, safeStorage, host: path.resolve('build/tunnel-host.exe') });
    await manager.init();
    await manager.configure({ executable: path.resolve('build/tunnel-host.exe'), profile: 'smoke', key: 'synthetic-electron-credential', autoStart: false });
    const encrypted = await fs.readFile(path.join(directory, 'credential.bin'));
    assert.equal(encrypted.includes(Buffer.from('synthetic-electron-credential')), false);
    assert.equal(safeStorage.decryptString(encrypted), 'synthetic-electron-credential');
    const snapshot = { appVersion: require('../package.json').version, config: { theme: 'dark', nasRoot: '' }, tunnel: await manager.view(), nasReachable: false, data: { projects: [], agents: [], workflows: [], extensions: [], activity: [] }, ollama: { status: 'offline', models: [] }, updateStatus: { state: 'dev' } };
    ipcMain.handle('platform:snapshot', () => snapshot);
    ipcMain.handle('builder:status', () => ({ root: '', projects: [] }));
    win = new BrowserWindow({ show: false, width: 1440, height: 920, webPreferences: { preload: path.resolve('src/preload.js'), contextIsolation: true, nodeIntegration: false } });
    const errors = []; win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
    await win.loadFile(path.resolve('src/app.html'), { hash: 'settings' });
    await new Promise(r => setTimeout(r, 800));
    const check = await win.webContents.executeJavaScript(`({ password: document.querySelector('#tunnelKey')?.type, buttons: ['saveTunnel','startTunnel','stopTunnel','restartTunnel','forgetTunnel'].every(id => !!document.getElementById(id)), text: document.body.innerText, title: document.title })`);
    assert.equal(check.password, 'password'); assert.equal(check.buttons, true); assert.equal(check.title, 'CodeHarborX');
    assert.equal(check.text.includes('synthetic-electron-credential'), false); assert.equal(errors.length, 0);
    await fs.mkdir(path.resolve('../../outputs'), { recursive: true });
    await fs.writeFile(path.resolve('../../outputs/CodeHarborX-tunnel-settings.png'), (await win.webContents.capturePage()).toPNG());
    console.log('PASS: Windows DPAPI encryption, credential isolation, branded Settings UI and tunnel controls.');
  } finally { if (win) win.destroy(); await fs.rm(directory, { recursive: true, force: true }); }
  app.exit(0);
}).catch(() => { console.error('FAIL: Electron smoke validation.'); app.exit(1); });
