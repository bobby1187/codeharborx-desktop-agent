// Build a real fixture installer without publishing or modifying the repository.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createPackaging } = require('../src/packaging');
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeharborx-package-smoke-'));
  try {
    const source = path.join(directory, 'frontend');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'index.html'), '<!doctype html><title>Platform smoke</title><h1>Packaged project</h1>');
    const packaging = createPackaging({ directory:path.join(directory, 'packaging') });
    await packaging.select(source);
    const target = { win32:'windows', darwin:'macos', linux:'linux' }[process.platform];
    const result = await packaging.build({ name:'Platform Smoke', version:'1.0.0', target });
    console.log(result.log);
    if (result.status !== 'complete') throw new Error(result.message);
    await verifyRuntime(path.dirname(result.artifacts[0]));
    for (const file of result.artifacts) {
      if ((await fs.stat(file)).size === 0) throw new Error('Empty installer');
      console.log('PASS: '+path.basename(file));
    }
  } finally { await fs.rm(directory, { recursive:true, force:true }); }
}
if (process.versions.electron) {
  const { app } = require('electron');
  app.whenReady().then(main).then(() => app.exit(0)).catch(error => { console.error(error.message); app.exit(1); });
} else main().catch(error => { console.error(error.message); process.exitCode = 1; });

async function verifyRuntime(output) {
  const executable = process.platform === 'win32' ? path.join(output, 'win-unpacked', 'Platform Smoke.exe') : process.platform === 'darwin' ? path.join(output, 'mac', 'Platform Smoke.app', 'Contents', 'MacOS', 'Platform Smoke') : path.join(output, 'linux-unpacked', 'platform-smoke');
  const child = spawn(executable, ['--remote-debugging-port=0', ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : [])], { stdio:['ignore','pipe','pipe'], windowsHide:true });
  let logs = '', failed;
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  child.on('error', error => { failed=error; });
  try {
    const deadline=Date.now()+30000;
    while(Date.now()<deadline) {
      if(failed) throw failed;
      if(child.exitCode !== null) throw new Error('Packaged app exited before readiness: '+logs);
      const match=logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if(match) {
        const pages=await(await fetch('http://127.0.0.1:'+match[1]+'/json/list')).json();
        const page=pages.find(p=>p.title==='Platform smoke');
        if(page) {
          const html=await(await fetch(page.url)).text();
          if(!html.includes('Packaged project')) throw new Error('Generated app served the wrong frontend.');
          console.log('PASS: native packaged app launches and serves the selected frontend.');
          return;
        }
      }
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    throw new Error('Packaged app did not render its frontend within 30 seconds: '+logs);
  } finally {
    const exit=new Promise(resolve=>child.once('exit',resolve));
    if(child.exitCode===null) { child.kill(); await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,5000))]); }
    if(child.exitCode===null) {child.kill('SIGKILL'); await exit;}
  }
}
