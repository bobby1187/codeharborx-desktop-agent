const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { TunnelManager } = require('../src/tunnel');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeharborx-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'tunnel-client.exe'); await fs.writeFile(executable, 'fixture');
  const launches = [];
  const manager = new TunnelManager({ directory, host: 'host.exe', safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(s.split('').reverse().join('')),
    decryptString: b => b.toString().split('').reverse().join('')
  }, spawnHost: (host, args, opts) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
    child.kill = () => child.emit('exit', 1);
    let data = ''; child.stdin.on('data', chunk => { data += chunk; });
    child.stdin.on('finish', () => { launches.at(-1).input = data; child.emit('exit', 0); });
    launches.push({ child, host, args, opts, data: () => data }); return child;
  }});
  await manager.init();
  await manager.configure({ executable, profile: 'codeharborx', key: 'synthetic-test-credential', autoStart: true });
  t.after(() => manager.stop());
  return { manager, launches, directory, executable };
}
test('configuration stores no plaintext secret and status never returns it', async t => {
  const { manager, directory } = await fixture(t);
  assert.equal((await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).includes('synthetic-test-credential'), false);
  assert.equal((await fs.readFile(path.join(directory, 'credential.bin'))).includes(Buffer.from('synthetic-test-credential')), false);
  assert.equal(JSON.stringify(await manager.view()).includes('synthetic-test-credential'), false);
  await assert.rejects(manager.configure({ executable: 'relative.exe', profile: 'bad' }));
  await assert.rejects(manager.configure({ executable: '', profile: 'codeharborx --evil' }));
});
test('hidden spawn sends credential only on stdin and repeated start is idempotent', async t => {
  const { manager, launches } = await fixture(t);
  await manager.start(); await manager.start();
  assert.equal(launches.length, 1);
  assert.equal(launches[0].opts.windowsHide, true); assert.equal(launches[0].opts.shell, false);
  assert.deepEqual(launches[0].args, []);
  assert.equal(launches[0].opts.env.CONTROL_PLANE_API_KEY, undefined);
  assert.equal(JSON.parse(launches[0].data()).key, 'synthetic-test-credential');
  await manager.stop(); assert.equal(manager.child, null); assert.equal(manager.desired, false);
});
test('unexpected exit reconnects; manual stop cancels retry', async t => {
  const { manager, launches } = await fixture(t);
  await manager.start(); launches[0].child.emit('exit', 1);
  assert.equal(manager.status.state, 'reconnecting');
  await new Promise(r => setTimeout(r, 1150));
  assert.equal(launches.length, 2);
  launches[1].child.emit('exit', 1); await manager.stop();
  await new Promise(r => setTimeout(r, 1150)); assert.equal(launches.length, 2);
});
test('restart serializes lifecycle and forgetting removes credential', async t => {
  const { manager, launches } = await fixture(t);
  await manager.start(); await Promise.all([manager.restart(), manager.start()]);
  assert.equal(launches.length, 2); await manager.forget();
  assert.equal((await manager.view()).credentialSaved, false); await manager.start();
  assert.equal(launches.length, 2); assert.equal(manager.status.state, 'disconnected');
});
test('secure storage failure refuses plaintext fallback', async t => {
  const { manager } = await fixture(t); manager.safeStorage.isEncryptionAvailable = () => false;
  await assert.rejects(manager.configure({ ...manager.config, key: 'new-synthetic-secret' }));
  await manager.start(); assert.equal(manager.child, null);
});
test('connection requires readiness and recent polling; remote health URLs are rejected', { timeout: 16000 }, async t => {
  const { manager, launches } = await fixture(t);
  let ready = true; let timestamp = Date.now() / 1000;
  manager.request = async url => url.endsWith('/readyz') ? { ok: ready } : url.endsWith('/metrics') ?
    { ok: true, text: async () => `commands_poll_last_successful_timestamp_seconds{service="fixture"} ${timestamp}\n` } :
    { ok: true, json: async () => ({ proxy_health: [{ route: { kind: 'control_plane' }, health_state: 'direct' }] }) };
  await manager.start();
  const input = JSON.parse(launches[0].data()); await fs.writeFile(input.healthFile, 'http://127.0.0.1:49999');
  await new Promise(r => setTimeout(r, 3200)); assert.equal(manager.status.state, 'connected');
  timestamp -= 200;
  await new Promise(r => setTimeout(r, 3200)); assert.equal(manager.status.state, 'disconnected');
  timestamp = Date.now() / 1000; ready = false;
  await new Promise(r => setTimeout(r, 3200)); assert.equal(manager.status.state, 'disconnected');
  await fs.writeFile(input.healthFile, 'http://example.com:80');
  let calls = 0; manager.request = async () => { calls++; return { ok: true }; };
  await new Promise(r => setTimeout(r, 3100)); assert.equal(calls, 0);
});
