const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

class TunnelManager {
  constructor({ directory, safeStorage, host, notify = () => {}, spawnHost = spawn, request = fetch }) {
    Object.assign(this, { directory, safeStorage, host, notify, spawnHost, request });
    this.config = { executable: '', profile: 'codeharborx', autoStart: true };
    this.status = { state: 'disconnected', message: 'Configure the ChatGPT tunnel in Settings.' };
    this.child = null; this.desired = false; this.attempt = 0; this.queue = Promise.resolve();
  }
  serial(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }
  set(state, message) { this.status = { state, message }; this.notify(this.status); }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    try { const c = JSON.parse(await fs.readFile(path.join(this.directory, 'settings.json'), 'utf8')); this.config = this.validate(c); } catch {}
    return this.view();
  }
  validate(c) {
    const executable = String(c.executable || '').trim();
    const profile = String(c.profile || 'codeharborx').trim();
    if (executable && (!path.isAbsolute(executable) || !/\.exe$/i.test(executable) || /[\r\n"\0]/.test(executable))) throw new Error('Select an absolute tunnel-client .exe path.');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profile)) throw new Error('Profile names may contain letters, numbers, underscores and hyphens.');
    return { executable, profile, autoStart: c.autoStart !== false };
  }
  async view() {
    let credentialSaved = false;
    try { await fs.access(path.join(this.directory, 'credential.bin')); credentialSaved = true; } catch {}
    return { ...this.config, credentialSaved, secureStorageAvailable: process.platform === 'win32' && this.safeStorage.isEncryptionAvailable(), ...this.status };
  }
  configure(input) { return this.serial(async () => {
    const config = this.validate(input);
    if (input.key) {
      if (process.platform !== 'win32' || !this.safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable. No credential was saved.');
      const key = String(input.key).trim();
      if (!key || /[\r\n\0]/.test(key) || key.length > 4096) throw new Error('Enter a valid runtime credential.');
      await fs.writeFile(path.join(this.directory, 'credential.bin'), this.safeStorage.encryptString(key));
      input.key = '';
    }
    await fs.writeFile(path.join(this.directory, 'settings.json'), JSON.stringify(config, null, 2));
    this.config = config;
    if (this.desired) { await this.stopInternal(); this.desired = true; await this.launch(); }
    return this.view();
  }); }
  forget() { return this.serial(async () => { await this.stopInternal(); await fs.rm(path.join(this.directory, 'credential.bin'), { force: true }); return this.view(); }); }
  start() { return this.serial(async () => { if (this.child || this.desired) return this.view(); this.desired = true; this.attempt = 0; await this.launch(); return this.view(); }); }
  stop() { return this.serial(async () => { await this.stopInternal(); return this.view(); }); }
  restart() { return this.serial(async () => { await this.stopInternal(); this.desired = true; this.attempt = 0; await this.launch(); return this.view(); }); }
  async launch() {
    if (!this.desired || this.child) return;
    let key;
    try {
      if (process.platform !== 'win32' || !this.safeStorage.isEncryptionAvailable()) throw new Error();
      if (!this.config.executable || !(await fs.stat(this.config.executable)).isFile()) throw new Error();
      key = this.safeStorage.decryptString(await fs.readFile(path.join(this.directory, 'credential.bin')));
    } catch { this.desired = false; this.set('disconnected', 'Set the tunnel executable, profile and secure credential in Settings.'); return; }
    this.set('starting', 'Starting the ChatGPT tunnel…');
    const healthFile = path.join(this.directory, `health-${crypto.randomUUID()}.url`);
    const env = { ...process.env }; delete env.CONTROL_PLANE_API_KEY; delete env.OPENAI_API_KEY; delete env.OPENAI_ADMIN_KEY;
    let child;
    try { child = this.spawnHost(this.host, [], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'], env }); }
    catch { this.desired = false; this.set('disconnected', 'The tunnel supervisor could not start.'); return; }
    this.child = child;
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify({ ...this.config, key, healthFile }) + '\n'); key = null;
    child.stdout.resume();
    let ended = false;
    const finish = () => {
      if (ended) return; ended = true;
      clearInterval(this.healthTimer); this.healthTimer = null;
      if (this.child === child) this.child = null;
      fs.rm(healthFile, { force: true }).catch(() => {});
      if (this.desired) {
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5));
        this.set('reconnecting', 'Tunnel exited unexpectedly. Reconnecting…');
        this.retryTimer = setTimeout(() => this.serial(() => this.launch()), delay);
      }
    };
    child.once('error', finish); child.once('exit', finish);
    let probing = false;
    this.healthTimer = setInterval(async () => {
      if (probing || this.child !== child || !this.desired) return;
      probing = true;
      let connected = false;
      try {
        const url = new URL((await fs.readFile(healthFile, 'utf8')).trim());
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) throw new Error();
        const opts = () => ({ signal: AbortSignal.timeout(2000), redirect: 'error' });
        const [ready, system, metrics] = await Promise.all([this.request(`${url.origin}/readyz`, opts()), this.request(`${url.origin}/api/system`, opts()), this.request(`${url.origin}/metrics`, opts())]);
        const data = system.ok ? await system.json() : {};
        const samples = metrics.ok ? await metrics.text() : '';
        const recentPoll = samples.split('\n').some(line => {
          const match = line.match(/^(?:[a-zA-Z0-9_]*_)?commands_poll_last_successful_timestamp_seconds(?:_seconds)?(?:\{[^}]*\})?\s+([0-9.eE+-]+)/);
          const age = match ? Date.now() / 1000 - Number(match[1]) : Infinity;
          return age >= -5 && age < 120;
        });
        connected = ready.ok && recentPoll && (data.proxy_health || []).some(p => p.route?.kind === 'control_plane' && ['healthy', 'direct'].includes(p.health_state));
      } catch {}
      probing = false;
      if (this.child !== child || !this.desired) return;
      if (connected) this.attempt = 0;
      this.set(connected ? 'connected' : 'disconnected', connected ? 'ChatGPT tunnel connected' : 'ChatGPT tunnel disconnected · checking connection');
    }, 3000);
  }
  async stopInternal() {
    this.desired = false; clearTimeout(this.retryTimer); clearInterval(this.healthTimer);
    const child = this.child;
    if (child) {
      this.set('stopping', 'Stopping the ChatGPT tunnel…');
      await new Promise(resolve => {
        const timeout = setTimeout(() => { child.kill(); }, 10000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
        child.once('error', () => { clearTimeout(timeout); resolve(); });
        child.stdin.end('stop\n');
      });
    }
    this.set('disconnected', 'ChatGPT tunnel stopped');
  }
}
module.exports = { TunnelManager };
