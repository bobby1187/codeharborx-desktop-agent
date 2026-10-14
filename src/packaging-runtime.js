// Runtime copied into generated desktop apps. Project code remains in an isolated renderer.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'web');
let server;
app.whenReady().then(() => {
  server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); return res.end(); }
    let file;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error();
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) && !path.extname(pathname)) file = path.join(root, 'index.html');
      if (!fs.statSync(file).isFile()) throw new Error();
    } catch { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.wasm':'application/wasm' };
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({ width:1280, height:800, webPreferences:{ nodeIntegration:false, contextIsolation:true, sandbox:true } });
    win.removeMenu();
    win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    win.loadURL(origin);
  });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (server) server.close(); });
