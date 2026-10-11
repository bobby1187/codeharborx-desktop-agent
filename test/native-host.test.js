const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

for (const mode of ['stop', 'parent-pipe EOF', 'supervisor crash']) test(`Windows hidden host cleans up on ${mode} without credential output`, { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeharborx-native-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'fixture.exe');
  execFileSync(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', `/out:${executable}`, path.resolve('test/TunnelFixture.cs')]);
  const marker = path.join(directory, 'graceful.txt');
  const pidFile = path.join(directory, 'pid.txt');
  const child = spawn(path.resolve('build/tunnel-host.exe'), [], { windowsHide: true, env: { ...process.env, CODEHARBORX_TEST_MARKER: marker, CODEHARBORX_TEST_PID_FILE: pidFile }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  const ended = new Promise((resolve, reject) => { child.on('exit', code => resolve(code)); child.on('error', reject); });
  child.stdin.write(JSON.stringify({ executable, profile: 'fixture', key: 'synthetic-native-credential', healthFile: path.join(directory, 'health.url') })+'\n');
  const deadline = Date.now() + 15000;
  let readyPid;
  while (!readyPid && Date.now() < deadline) {
    try { readyPid = Number(await fs.readFile(pidFile, 'utf8')); } catch {}
    if (!readyPid) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(readyPid, 'The sample client must install its interrupt handler before the shutdown test.');
  if (mode === 'supervisor crash') {
    child.kill(); await ended; await new Promise(r => setTimeout(r, 300));
    assert.throws(() => process.kill(readyPid, 0));
  } else {
    child.stdin.end(mode === 'stop' ? 'stop\n' : '');
    assert.equal(await ended, 0);
    assert.equal(await fs.readFile(marker, 'utf8'), 'graceful');
  }
  assert.equal(output.trim(), 'started');
});
