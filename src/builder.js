const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const http = require("http");

function createBuilder(options) {
  const root = path.join(options.userDataPath, "builder-workspaces");
  const previews = new Map();
  const generating = new Set();
  const deleting = new Set();

  async function deletionTarget(id, rel) {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Invalid Builder project.');
    const base = path.resolve(dir(id));
    const realRoot = await fsp.realpath(root);
    if (path.dirname(base) !== path.resolve(root) || (await fsp.lstat(base)).isSymbolicLink() || (await fsp.realpath(base)) !== path.join(realRoot, id)) throw new Error('Builder project must be inside its workspace.');
    const info = await manifest(id);
    if (!info || info.id !== id) throw new Error('Builder project not found.');
    if (generating.has(id)) throw new Error('Wait for the current build to finish before deleting.');
    if (rel === undefined) return { target: base, info };
    if (typeof rel !== 'string' || !rel || /[\\:\0]/.test(rel) || rel.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.') || p === 'node_modules')) throw new Error('Invalid Builder file path.');
    const target = safe(id, rel);
    let current = base;
    for (const part of rel.split('/')) {
      current = path.join(current, part);
      if ((await fsp.lstat(current)).isSymbolicLink()) throw new Error('Linked paths cannot be deleted from Builder.');
    }
    if (!(await fsp.stat(target)).isFile()) throw new Error('Select a Builder file to delete.');
    if (!(await fsp.realpath(target)).startsWith((await fsp.realpath(base)) + path.sep)) throw new Error('File is outside the Builder project.');
    return { target, info };
  }
  async function deleteProject(id) {
    if (deleting.has(id)) throw new Error('Deletion is already in progress.');
    deleting.add(id);
    try {
      const { target } = await deletionTarget(id);
      await stopPreview(id);
      await options.shell.trashItem(target);
      return { ok: true };
    } finally { deleting.delete(id); }
  }
  async function deleteFile(id, rel) {
    if (deleting.has(id)) throw new Error('Deletion is already in progress.');
    deleting.add(id);
    try {
      const { target } = await deletionTarget(id, rel);
      await options.shell.trashItem(target);
      const m = await manifest(id);
      m.updatedAt = new Date().toISOString(); await saveManifest(id, m);
      return { ok: true };
    } finally { deleting.delete(id); }
  }

  function slug(value) {
    return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  }
  function dir(id) { return path.join(root, slug(id)); }
  function safe(id, rel) {
    const base = path.resolve(dir(id));
    const target = path.resolve(base, String(rel || ""));
    if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Path is outside the Builder workspace.");
    return target;
  }
  async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }
  async function manifest(id) {
    try { return JSON.parse(await fsp.readFile(path.join(dir(id), ".codeharborx.json"), "utf8")); } catch { return null; }
  }
  async function saveManifest(id, data) {
    await fsp.writeFile(path.join(dir(id), ".codeharborx.json"), JSON.stringify(data, null, 2), "utf8");
  }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  }
  function starter(name, template) {
    if (template === "dashboard") {
      return {
        "index.html": '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(name)+'</title><link rel="stylesheet" href="styles.css"></head><body><div class="app"><aside><h2>'+esc(name)+'</h2><a>Dashboard</a><a>Customers</a><a>Orders</a><a>Analytics</a><a>Settings</a></aside><main><small>CODEHARBORX BUILDER</small><h1>Command Center</h1><div class="stats"><article><span>Users</span><b>1,284</b></article><article><span>Revenue</span><b>$24.8K</b></article><article><span>Orders</span><b>386</b></article></div><section><h3>Platform activity</h3><div class="chart"></div></section></main></div></body></html>',
        "styles.css": ':root{font-family:Segoe UI,system-ui;background:#06111f;color:#eef7ff}*{box-sizing:border-box}body{margin:0}.app{min-height:100vh;display:grid;grid-template-columns:220px 1fr}aside{background:#081727;border-right:1px solid #173b5e;padding:24px 16px}aside h2{margin:0 0 28px}aside a{display:block;padding:11px;margin:4px 0;border-radius:9px;color:#8da8c7}aside a:first-of-type{background:#0a7bff22;color:#35dfee}main{padding:36px}small{color:#35dfee;font-weight:800;letter-spacing:.15em}h1{font-size:40px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stats article,section{background:#0a1b2e;border:1px solid #173b5e;border-radius:16px;padding:20px}.stats span{display:block;color:#8da8c7}.stats b{display:block;font-size:30px;margin-top:8px}section{margin-top:14px}.chart{height:280px;border-radius:12px;background:linear-gradient(180deg,#0a7bff33,transparent),repeating-linear-gradient(90deg,transparent 0 59px,#173b5e 60px)}@media(max-width:800px){.app{grid-template-columns:1fr}aside{display:none}.stats{grid-template-columns:1fr}}'
      };
    }
    return {
      "index.html": '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(name)+'</title><link rel="stylesheet" href="styles.css"></head><body><div class="wrap"><header><b>'+esc(name)+'</b><nav>Home &nbsp; Services &nbsp; About &nbsp; Contact</nav></header><main class="hero"><div><small>BUILT WITH CODEHARBORX</small><h1>Build something worth launching.</h1><p>This project was created locally by CodeHarborX Builder. Edit the files, use a local Ollama model, or control Builder through MCP.</p><button>Get Started</button></div><div class="visual">&#9875;</div></main></div></body></html>',
      "styles.css": ':root{font-family:Segoe UI,system-ui;background:#06111f;color:#eef7ff}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#06111f,#092644);min-height:100vh}.wrap{width:min(1120px,calc(100% - 36px));margin:auto}header{height:78px;display:flex;align-items:center;justify-content:space-between}header b{font-size:22px}nav{color:#91abc7}.hero{min-height:75vh;display:grid;grid-template-columns:1.15fr .85fr;align-items:center;gap:40px}.hero small{color:#26ddeb;font-weight:800;letter-spacing:.15em}.hero h1{font-size:clamp(48px,7vw,82px);line-height:.96;letter-spacing:-.055em;margin:16px 0}.hero p{font-size:18px;line-height:1.65;color:#9bb2cc}.hero button{padding:13px 18px;border:0;border-radius:12px;background:#0874f9;color:white;font-weight:800}.visual{min-height:400px;display:grid;place-items:center;border:1px solid #1d527d;border-radius:28px;background:radial-gradient(circle,rgba(27,220,235,.24),transparent 55%),#08192b;font-size:100px;box-shadow:0 35px 90px rgba(0,0,0,.35)}@media(max-width:760px){nav{display:none}.hero{grid-template-columns:1fr;padding:50px 0}.visual{min-height:280px}}'
    };
  }

  async function createProject(input) {
    await fsp.mkdir(root, { recursive:true });
    const name = String(input && input.name || "New Project").trim();
    let id = slug(name), n = 2;
    while (await exists(dir(id))) id = slug(name) + "-" + n++;
    await fsp.mkdir(dir(id), { recursive:true });
    const template = input && input.template === "dashboard" ? "dashboard" : "website";
    const files = starter(name, template);
    for (const file of Object.keys(files)) await fsp.writeFile(safe(id, file), files[file], "utf8");
    const info = { id, name, template, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    await saveManifest(id, info);
    return info;
  }

  async function listProjects() {
    await fsp.mkdir(root, { recursive:true });
    const entries = await fsp.readdir(root, { withFileTypes:true });
    const out = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const m = await manifest(entry.name);
      if (m) out.push({ ...m, path:dir(entry.name), preview:previewInfo(entry.name) });
    }
    return out.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function listFiles(id) {
    const base = dir(id);
    if (!(await exists(base))) throw new Error("Builder project not found.");
    const out = [];
    async function walk(folder, prefix) {
      const entries = await fsp.readdir(folder, { withFileTypes:true });
      for (const e of entries) {
        if (e.name === ".codeharborx.json" || e.name === "node_modules" || e.name === ".git") continue;
        const rel = prefix ? prefix + "/" + e.name : e.name;
        if (e.isDirectory()) await walk(path.join(folder, e.name), rel);
        else out.push(rel);
        if (out.length > 400) return;
      }
    }
    await walk(base, "");
    return out.sort();
  }

  async function readFile(id, rel) {
    const target = safe(id, rel);
    const stat = await fsp.stat(target);
    if (!stat.isFile() || stat.size > 2000000) throw new Error("File cannot be edited in Builder.");
    return { path:rel, content:await fsp.readFile(target, "utf8") };
  }

  async function writeFile(id, rel, content) {
    if (deleting.has(id)) throw new Error('Deletion is in progress.');
    if (!(await manifest(id))) throw new Error('Builder project not found.');
    if (!rel || String(rel).startsWith(".") || String(rel).includes("..")) throw new Error("Invalid Builder file path.");
    const target = safe(id, rel);
    await fsp.mkdir(path.dirname(target), { recursive:true });
    const text = String(content == null ? "" : content);
    if (Buffer.byteLength(text, "utf8") > 2000000) throw new Error("File exceeds the 2 MB Builder editor limit.");
    await fsp.writeFile(target, text, "utf8");
    const m = await manifest(id);
    if (m) { m.updatedAt = new Date().toISOString(); await saveManifest(id, m); }
    return { ok:true, path:rel };
  }

  async function generateInternal(input) {
    const id = input && input.projectId;
    const prompt = String(input && input.prompt || "").trim();
    const model = String(input && input.model || "").trim();
    if (!id || !prompt || !model) throw new Error("Project, prompt, and Ollama model are required.");
    const files = await listFiles(id);
    const instruction = [
      "You are CodeHarborX Builder running locally.",
      "Create or update a polished website or web platform from the user request.",
      "Return only strict JSON: {\"files\":[{\"path\":\"index.html\",\"content\":\"...\"},{\"path\":\"styles.css\",\"content\":\"...\"},{\"path\":\"script.js\",\"content\":\"...\"}]}",
      "No markdown fences and no explanation. Keep the result runnable locally.",
      "Existing files: " + files.join(", "),
      "User request: " + prompt
    ].join("\n");
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ model, prompt:instruction, stream:false, options:{temperature:0.3} }),
      signal:AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error("Ollama generation failed.");
    const data = await response.json();
    let raw = String(data.response || "").trim();
    const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("The local model did not return valid Builder JSON. Try a stronger coding model."); }
    const changed = [];
    for (const file of Array.isArray(parsed.files) ? parsed.files.slice(0,30) : []) {
      const rel = String(file.path || "").replace(/\\/g,"/").replace(/^\/+/,"");
      if (!rel || rel.startsWith(".") || rel.includes("..")) continue;
      await writeFile(id, rel, String(file.content == null ? "" : file.content));
      changed.push(rel);
    }
    if (!changed.length) throw new Error("The model did not return any usable files.");
    return { ok:true, files:changed, model };
  }
  async function generate(input) {
    const id = input && input.projectId;
    if (generating.has(id) || deleting.has(id)) throw new Error('This project already has a build or deletion in progress.');
    generating.add(id);
    try { return await generateInternal(input); } finally { generating.delete(id); }
  }

  function mime(file) {
    const e = path.extname(file).toLowerCase();
    return ({".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"})[e] || "application/octet-stream";
  }
  function previewInfo(id) {
    const p = previews.get(slug(id));
    return p ? { running:true, url:p.url, port:p.port } : { running:false, url:null, port:null };
  }
  async function startPreview(id) {
    id = slug(id);
    if (previews.has(id)) return previewInfo(id);
    if (!(await exists(dir(id)))) throw new Error("Builder project not found.");
    const server = http.createServer(async (req,res) => {
      try {
        const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let rel = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/,"");
        let target = safe(id, rel);
        if (!(await exists(target))) { rel = "index.html"; target = safe(id, rel); }
        const body = await fsp.readFile(target);
        res.writeHead(200,{ "Content-Type":mime(rel), "Cache-Control":"no-store" });
        res.end(body);
      } catch {
        res.writeHead(404,{ "Content-Type":"text/plain" });
        res.end("CodeHarborX Builder preview: file not found.");
      }
    });
    await new Promise((resolve,reject) => { server.once("error",reject); server.listen(0,"127.0.0.1",resolve); });
    const port = server.address().port;
    const url = "http://127.0.0.1:" + port + "/";
    previews.set(id,{server,port,url});
    return { running:true, url, port };
  }
  async function stopPreview(id) {
    id = slug(id);
    const p = previews.get(id);
    if (!p) return { ok:true };
    await new Promise(resolve => { p.server.close(resolve); p.server.closeAllConnections(); });
    previews.delete(id);
    return { ok:true };
  }
  async function openFolder(id) {
    const error = await options.shell.openPath(dir(id));
    if (error) throw new Error(error);
    return { ok:true };
  }
  async function status() { return { root, projects:await listProjects() }; }
  function tools() {
    return [
      { name:"builder_status",description:"List CodeHarborX Builder projects.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false} },
      { name:"builder_create_project",description:"Create a local website or dashboard project.",inputSchema:{type:"object",required:["name"],properties:{name:{type:"string"},template:{type:"string",enum:["website","dashboard"]}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false} },
      { name:"builder_list_files",description:"List files in a Builder project.",inputSchema:{type:"object",required:["projectId"],properties:{projectId:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false} },
      { name:"builder_read_file",description:"Read a Builder project text file.",inputSchema:{type:"object",required:["projectId","path"],properties:{projectId:{type:"string"},path:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false} },
      { name:"builder_write_file",description:"Create or replace a Builder project text file.",inputSchema:{type:"object",required:["projectId","path","content"],properties:{projectId:{type:"string"},path:{type:"string"},content:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false} },
      { name:"builder_generate",description:"Use a local Ollama model to build or edit a web project.",inputSchema:{type:"object",required:["projectId","prompt","model"],properties:{projectId:{type:"string"},prompt:{type:"string"},model:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false} },
      { name:"builder_start_preview",description:"Start a localhost preview.",inputSchema:{type:"object",required:["projectId"],properties:{projectId:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false} },
      { name:"builder_stop_preview",description:"Stop a localhost preview.",inputSchema:{type:"object",required:["projectId"],properties:{projectId:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false} }
    ];
  }
  async function callTool(name,args) {
    if (name === "builder_status") return status();
    if (name === "builder_create_project") return createProject(args);
    if (name === "builder_list_files") return listFiles(args.projectId);
    if (name === "builder_read_file") return readFile(args.projectId,args.path);
    if (name === "builder_write_file") return writeFile(args.projectId,args.path,args.content);
    if (name === "builder_generate") return generate(args);
    if (name === "builder_start_preview") return startPreview(args.projectId);
    if (name === "builder_stop_preview") return stopPreview(args.projectId);
  }
  function closeAll() {
    for (const p of previews.values()) { try { p.server.close(); p.server.closeAllConnections(); } catch {} }
    previews.clear();
  }
  return { status,createProject,listFiles,readFile,writeFile,generate,startPreview,stopPreview,openFolder,tools,callTool,closeAll,deletionTarget,deleteProject,deleteFile };
}
module.exports = { createBuilder };
