const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const TARGETS = { windows:{ flag:'win', format:'nsis', extension:'.exe' }, macos:{ flag:'mac', format:'dmg', extension:'.dmg' }, linux:{ flag:'linux', format:['AppImage','deb'], extension:['.AppImage','.deb'] } };
const EXCLUDED = new Set(['node_modules', '.git', '.hg', '.svn', '.next', '.cache']);

async function inspectProject(folder) {
  const source = await fs.realpath(folder);
  if (!(await fs.stat(source)).isDirectory()) throw new Error('Choose a project folder.');
  for (const relative of ['dist', 'build', '.', 'public']) {
    const web = path.resolve(source, relative);
    try {
      if ((await fs.lstat(web)).isSymbolicLink() || (await fs.lstat(path.join(web, 'index.html'))).isSymbolicLink()) continue;
      if ((await fs.stat(path.join(web, 'index.html'))).isFile()) return { source, web, name:path.basename(source) };
    } catch (error) { if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new Error('No built website found. Build your frontend first, then select a folder with index.html in its root, dist, build, or public directory. Backend services are not bundled.');
}

async function copyWeb(source, destination) {
  let bytes = 0, count = 0;
  async function copy(from, to) {
    await fs.mkdir(to, { recursive:true });
    for (const item of await fs.readdir(from, { withFileTypes:true })) {
      if (EXCLUDED.has(item.name) || item.name.startsWith('.') || /\.(pem|key|pfx|p12)$/i.test(item.name)) continue;
      const original = path.join(from, item.name), target = path.join(to, item.name);
      const stat = await fs.lstat(original);
      if (stat.isSymbolicLink()) throw new Error('Linked files are not supported. Copy the project assets into the selected folder first.');
      if (stat.isDirectory()) await copy(original, target);
      else if (stat.isFile()) {
        bytes += stat.size; count++;
        if (bytes > 1024 * 1024 * 1024 || count > 25000) throw new Error('The website exceeds the packaging limit of 1 GB or 25,000 files. Select the built frontend output folder.');
        await fs.copyFile(original, target);
      } else throw new Error('The project contains an unsupported special file.');
    }
  }
  await copy(source, destination);
}

function createPackaging({ directory, notify = () => {}, platform = process.platform, run = runProcess, resolveTool, openPath }) {
  let selected = null, state = { status:'idle', message:'Select a project folder to begin.', artifacts:[], log:'' }, busy = false;
  let jobs = path.join(directory, 'jobs'), tooling = path.join(directory, 'tooling');
  async function prepare() {
    await fs.mkdir(directory, { recursive:true });
    directory = await fs.realpath(directory);
    jobs = path.join(directory, 'jobs'); tooling = path.join(directory, 'tooling');
  }
  function publish(patch) { state = { ...state, ...patch }; notify(view()); }
  function view() { return { ...state, project:selected && { ...selected }, host:platform, targets:Object.keys(TARGETS) }; }
  async function init() {
    await prepare();
    try {
      const saved = JSON.parse(await fs.readFile(path.join(directory, 'last-package.json'), 'utf8'));
      if (saved.status === 'complete' && Array.isArray(saved.artifacts) && saved.artifacts.length && saved.artifacts.every(file => typeof file === 'string' && path.resolve(file).startsWith(path.resolve(jobs) + path.sep))) {
        await Promise.all(saved.artifacts.map(file => fs.access(file)));
        state = { ...state, status:'complete', message:'Your latest package is ready.', artifacts:saved.artifacts };
      }
    } catch {}
    return view();
  }
  async function select(folder) {
    if (busy) throw new Error('Wait for the current package to finish.');
    await prepare();
    selected = await inspectProject(folder);
    publish({ status:'idle', message:'Project ready to package.', artifacts:[], log:'' });
    return view();
  }
  function log(chunk) { publish({ log:(state.log + String(chunk)).slice(-16000) }); }
  async function tool() {
    if (resolveTool) return resolveTool();
    try { return require.resolve('electron-builder'); } catch {}
    const entry = path.join(tooling, 'node_modules', 'electron-builder', 'out', 'index.js');
    try { await fs.access(entry); return entry; } catch {}
    await fs.mkdir(tooling, { recursive:true });
    publish({ message:'Installing packaging tools. Node.js with npm and internet access are required on the first build.' });
    const env = { ...process.env, ELECTRON_GET_USE_PROXY:'1' };
    const args = ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'electron-builder@26.0.12'];
    if (platform === 'win32') await run('cmd.exe', ['/d','/s','/c', 'npm ' + args.join(' ')], { cwd:tooling, env }, log);
    else await run('npm', args, { cwd:tooling, env }, log);
    await fs.access(entry); return entry;
  }
  async function build(input) {
    if (busy) throw new Error('A package is already building.');
    if (!selected) throw new Error('Select a project folder first.');
    const target = TARGETS[input.target];
    if (!target) throw new Error('Choose Windows, macOS, or Linux.');
    if (input.target === 'macos' && platform !== 'darwin') throw new Error('macOS disk images must be built on a Mac. Open this project in CodeHarborX on macOS.');
    const name = String(input.name || '').trim(), version = String(input.version || '').trim();
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(name)) throw new Error('Enter an app name of 1–80 letters, numbers, spaces, dots, underscores, or hyphens.');
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Enter a version such as 1.0.0.');
    busy = true;
    publish({ status:'building', message:'Copying the built frontend…', artifacts:[], log:'' });
    const job = path.join(jobs, crypto.randomUUID()), staged = path.join(job, 'app'), output = path.join(job, 'output');
    try {
      // Revalidate the selection before copying. Never execute project scripts.
      const current = await inspectProject(selected.source);
      if (current.web !== selected.web) throw new Error('The project output changed. Select the folder again.');
      await copyWeb(current.web, path.join(staged, 'web'));
      await fs.copyFile(path.join(__dirname, 'packaging-runtime.js'), path.join(staged, 'main.js'));
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'desktop-app';
      await fs.writeFile(path.join(staged, 'package.json'), JSON.stringify({ name:slug, productName:name, version, description:name+' desktop application', author:'Project owner', homepage:'https://github.com/bobby1187/codeharborx-desktop-agent', main:'main.js' }, null, 2));
      const config = { projectDir:staged, [target.flag]:Array.isArray(target.format) ? target.format : [target.format], x64:true, publish:'never', config:{ appId:'local.codeharborx.'+slug, productName:name, electronVersion:'38.2.1', electronDownload:{ cache:path.join(directory, 'cache', 'electron') }, directories:{ output }, files:['main.js','web/**/*','package.json'], artifactName:'${productName}-${version}-${os}-${arch}.${ext}', asar:true, npmRebuild:false, publish:[], nsis:{ oneClick:false, allowToChangeInstallationDirectory:true }, mac:{ identity:null }, linux:{ category:'Utility', maintainer:'Project owner' } } };
      await fs.writeFile(path.join(job, 'build-config.json'), JSON.stringify(config));
      const entry = await tool();
      // Run outside app.asar with Electron archive interception disabled: the
      // packager must create real .asar files rather than open them as folders.
      const worker = path.join(job, 'packaging-worker.js');
      await fs.copyFile(path.join(__dirname, 'packaging-worker.js'), worker);
      publish({ message:'Building '+input.target+' package. The first build downloads platform tools and Electron.' });
      await run(process.execPath, [worker, entry, job], { cwd:job, env:{ ...process.env, ELECTRON_RUN_AS_NODE:'1', ELECTRON_NO_ASAR:'1', ELECTRON_GET_USE_PROXY:'1', CSC_IDENTITY_AUTO_DISCOVERY:'false', ELECTRON_BUILDER_CACHE:path.join(directory, 'cache', 'builder') } }, log);
      const artifacts = [];
      for (const filename of await fs.readdir(output)) {
        if ((Array.isArray(target.extension) ? target.extension : [target.extension]).some(extension => filename.endsWith(extension)) && (await fs.stat(path.join(output, filename))).size > 0) artifacts.push(path.join(output, filename));
      }
      if (artifacts.length < (Array.isArray(target.extension) ? target.extension.length : 1)) throw new Error('The build finished without the expected installer. Check the build log.');
      await fs.writeFile(path.join(directory, 'last-package.json'), JSON.stringify({status:'complete', artifacts}));
      publish({ status:'complete', message:'Package ready. Transfer it to the target computer to install your app.', artifacts });
    } catch (error) { publish({ status:'failed', message:error.message }); }
    finally { busy = false; await fs.rm(staged, { recursive:true, force:true }).catch(() => {}); }
    return view();
  }
  async function reveal(index) {
    const artifact = state.artifacts[index];
    if (!artifact) throw new Error('Package not found.');
    await fs.access(artifact);
    return openPath(path.dirname(artifact));
  }
  return { init, view, select, build, reveal, isBusy:() => busy };
}
function runProcess(command, args, options, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.on('error', error => reject(new Error(error.code === 'ENOENT' ? 'Install Node.js (including npm) to prepare packaging tools, then try again.' : error.message)));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('Packaging failed (exit '+code+'). See the build log for missing tools or project errors.')));
  });
}
module.exports = { createPackaging, inspectProject, copyWeb };
