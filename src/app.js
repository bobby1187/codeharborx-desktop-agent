const NAV = [
  ["dashboard","Dashboard","⌂"],["command-center","Command Center","⌘"],["projects","Project Studio","</>"],["builder","Builder","⚒"],
  ["ai-agents","AI Agents","✦"],["prompt-lab","Prompt Lab","✎"],["workflows","Workflows","⇄"],
  ["desktop-agents","Desktop Agents","▣"],["local-runner","Local Runner","◉"],["github-sync","GitHub Sync","◈"],
  ["backups","Backup Center","▤"],["packaging","App Packaging","▰"],["deployments","Deployments","↗"],
  ["analytics","Analytics","⌁"],["knowledge","Knowledge Base","▧"],["assets","Asset Library","◇"],
  ["extensions","Extensions","✚"],["team","Team & Roles","♙"],["ai-control","AI Control / MCP","{}"]
];

let snapshot = null;
let builderState = { root:"", projects:[] };
let route = (location.hash || "#dashboard").slice(1);
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
const fmt = (value) => { try { return new Date(value).toLocaleString(); } catch { return String(value || ""); } };

function badge(text, type) {
  return '<span class="badge ' + (type || "info") + '">' + esc(text) + "</span>";
}
function metric(label, value, detail) {
  return '<div class="metric"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong><small>" + esc(detail) + "</small></div>";
}
function stat(label, value, detail) {
  return '<div class="stat"><span>' + esc(label) + "</span><b>" + esc(value) + "</b><small>" + esc(detail || "") + "</small></div>";
}
function card(title, subtitle, body) {
  return '<article class="card"><div class="card-head"><div><small>' + esc(subtitle || "") + "</small><h2>" + esc(title) + "</h2></div></div>" + body + "</article>";
}
function pageHead(eyebrow, title, description, actions) {
  return '<div class="page-title"><div><span class="eyebrow">' + esc(eyebrow) + "</span><h1>" + esc(title) + "</h1><p>" + esc(description) + '</p></div><div class="section-actions">' + (actions || "") + "</div></div>";
}
function projectLayers(project) {
  const s = project.latestSnapshot;
  return s ? [s.sourceCode,s.databaseDump,s.filesAssets,s.githubSnapshot,s.buildsInstallers,s.restoreRecord].filter(Boolean).length : 0;
}
function navigate(next) {
  route = next;
  location.hash = next;
  drawNav();
  render();
}
function drawNav() {
  $("#nav").innerHTML = NAV.map((item) =>
    '<button class="nav-button ' + (route === item[0] ? "active" : "") + '" data-route="' + item[0] + '"><span class="nav-icon">' + item[2] + "</span><span>" + item[1] + "</span></button>"
  ).join("");
  document.querySelectorAll("[data-route]").forEach((button) => button.onclick = () => navigate(button.dataset.route));
}
function listRows(items, icon, mapper) {
  if (!items.length) return '<div class="empty">Nothing has been added yet.</div>';
  return '<div class="list">' + items.map((item) => {
    const row = mapper(item);
    return '<div class="row"><div class="row-icon">' + icon + "</div><div><b>" + esc(row.title) + "</b><small>" + esc(row.meta) + "</small></div>" + badge(row.status || "Local", row.type || "info") + "</div>";
  }).join("") + "</div>";
}

function dashboardPage() {
  const data = snapshot.data;
  const projects = data.projects || [];
  const protectedCount = projects.filter((p) => p.status === "protected").length;
  const backupPercent = projects.length ? Math.round(protectedCount / projects.length * 100) : 0;
  const activity = (data.activity || []).slice(0, 12).map((a) => '<div><time>' + esc(fmt(a.at)) + "</time>" + esc(a.message) + "</div>").join("") || "No activity yet.";

  return '<section class="hero"><div><span class="eyebrow">CODEHARBORX COMMAND CENTER</span><h1>Build. Automate. Deploy. <em>Own it.</em></h1>' +
    "<p>Your standalone development harbor for projects, local AI, GitHub metadata, backups, packaging, restore points, MCP control, and automation. This installed application runs locally and stores its own data on this computer.</p>" +
    '<div class="hero-actions"><button class="button primary" id="newProject">＋ New project</button><button class="button" data-go="command-center">⚡ Open command center</button></div></div>' +
    '<img class="hero-logo" src="../build/icon.png" alt="CodeHarborX"></section>' +
    '<section class="metrics">' +
      metric("Projects", projects.length, protectedCount + " fully protected") +
      metric("AI agents", (data.agents || []).length, snapshot.ollama.models.length + " local model(s)") +
      metric("Backup health", backupPercent + "%", snapshot.nasReachable ? "NAS reachable" : "NAS needs attention") +
      metric("Workflows", (data.workflows || []).length, (data.workflows || []).filter((w) => w.status === "active").length + " active") +
      metric("Extensions", (data.extensions || []).filter((x) => x.enabled).length, "local integrations") +
    "</section>" +
    '<section class="grid two">' +
      card("Harbor pulse", "LOCAL DEVELOPMENT ACTIVITY", '<div class="activity">' + activity + "</div>") +
      card("Local operations", "QUICK ACTIONS",
        '<div class="quick"><button class="button" id="testNas">Test NAS</button><button class="button" id="scanNas">Scan backups</button><button class="button" id="checkOllama">Check Ollama</button><button class="button" data-go="desktop-agents">Desktop controls</button></div>' +
        '<div class="notice" style="margin-top:12px"><strong>Standalone mode:</strong> no hosted application runtime is required.</div>') +
    "</section>";
}

function commandPage() {
  const projects = snapshot.data.projects || [];
  return pageHead("OPERATIONS","Command Center","One launch pad for building, backing up, packaging, deploying, and approved AI control.") +
    '<section class="grid">' +
      card("Project operations","SOURCE & PROJECT STATE",'<div class="stat-grid">' + stat("Tracked",projects.length,"local registry") + stat("Protected",projects.filter((p)=>p.status==="protected").length,"six recovery layers") + '</div><button class="button primary" data-go="projects" style="margin-top:10px;width:100%">Open Project Studio</button>') +
      card("AI operations","LOCAL + OPTIONAL CLOUD",'<div class="stat-grid">' + stat("Agents",(snapshot.data.agents||[]).length,"local records") + stat("MCP",snapshot.mcpListening?"Ready":"Offline","localhost only") + '</div><button class="button" data-go="ai-control" style="margin-top:10px;width:100%">AI Control Center</button>') +
      card("Recovery operations","NAS & RESTORE READINESS",'<div class="stat-grid">' + stat("NAS",snapshot.nasReachable?"Online":"Configured","backup target") + stat("Restore sets",projects.filter((p)=>p.latestSnapshot&&p.latestSnapshot.restoreRecord).length,"current records") + '</div><button class="button" data-go="backups" style="margin-top:10px;width:100%">Open Backup Center</button>') +
      card("Local execution","PRIVATE COMPUTE","<p>Run Ollama models and approved local jobs without depending on a hosted app.</p><button class=\"button\" data-go=\"local-runner\" style=\"width:100%\">Open Local Runner</button>") +
      card("Build & package","RELEASE ENGINEERING","<p>Track Windows releases and GitHub updater artifacts from the local command center.</p><button class=\"button\" data-go=\"packaging\" style=\"width:100%\">Open Packaging</button>") +
      card("Automation","REPEATABLE WORK","<p>Track backup, validation, build, restore, and deployment workflows as local records.</p><button class=\"button\" data-go=\"workflows\" style=\"width:100%\">Open Workflows</button>") +
    "</section>";
}

function projectsPage() {
  const projects = snapshot.data.projects || [];
  return pageHead("PROJECT STUDIO","Projects","Your standalone registry links source, GitHub, local paths, backup destinations, builds, and restore state.",'<button class="button primary" id="newProject">＋ Add project</button>') +
    card("Project fleet", projects.length + " REGISTERED PROJECTS", listRows(projects, "◈", (p) => ({
      title:p.name,
      meta:(p.githubRepo || p.localPath || "Local project") + " · " + projectLayers(p) + "/6 backup layers",
      status:p.status.replace("_"," "),
      type:p.status === "protected" ? "good" : p.status === "needs_backup" ? "warn" : "info"
    })));
}

function agentsPage() {
  const agents = snapshot.data.agents || [];
  return pageHead("AI OPERATIONS","AI Agents","Specialized local records for routing work between local models, optional cloud models, and MCP clients.") +
    '<section class="grid">' +
      card("Agent fleet","SPECIALIZED ROLES",stat("Templates",agents.length,"stored locally")) +
      card("Model router","LOCAL AI",stat("Ollama",snapshot.ollama.status === "online" ? "Online" : "Offline",snapshot.ollama.models.length + " detected models")) +
      card("External AI","MCP CLIENTS",stat("Control surface","MCP","127.0.0.1 only")) +
    "</section>" +
    card("AI crew","LOCAL AGENT RECORDS",listRows(agents,"✦",(a)=>({title:a.name,meta:a.specialty+" · "+a.provider+" · "+a.model,status:a.status,type:"good"})));
}

function workflowsPage() {
  const workflows = snapshot.data.workflows || [];
  return pageHead("AUTOMATION","Workflows","Reusable local workflow records for backup, validation, builds, restore testing, and deployment.") +
    card("Workflow registry",workflows.length+" LOCAL WORKFLOWS",listRows(workflows,"⇄",(w)=>({title:w.name,meta:w.description,status:w.status,type:w.status==="active"?"good":"info"})));
}

function desktopPage() {
  return pageHead("LOCAL BRIDGE","Desktop Agents","This installed app is the agent. Local services run directly on this computer; there is no hosted pairing requirement.") +
    '<section class="grid">' +
      card("This computer","PRIMARY DEVELOPMENT MACHINE",stat("Device",snapshot.deviceName,"CodeHarborX local runtime")) +
      card("UGREEN NAS","PROJECT_BACKUPS AREA",stat("Target",snapshot.nasReachable?"Reachable":"Not reachable",snapshot.config.nasRoot)) +
      card("Local AI","OLLAMA DISCOVERY",stat("Runtime",snapshot.ollama.status==="online"?"Online":"Offline",snapshot.ollama.models.length+" model(s)")) +
      card("MCP Bridge","CHATGPT / APPROVED CLIENTS",stat("Status",snapshot.mcpListening?"Listening":"Offline","127.0.0.1:"+snapshot.mcpPort)) +
      card("Standalone storage","LOCAL APP DATA","<p>Project records, settings, workflows, and metadata are stored in the Windows application data folder.</p><button class=\"button\" id=\"openDataFolder\">Open data folder</button>") +
      card("Automatic updates","GITHUB RELEASES","<p id=\"updateText\">" + esc((snapshot.updateStatus&&snapshot.updateStatus.message)||"Automatic GitHub updates enabled") + '</p><div class="section-actions"><button class="button" id="checkUpdates">Check now</button><button class="button primary" id="installUpdate" style="' + ((snapshot.updateStatus&&snapshot.updateStatus.state)==="ready"?"":"display:none") + '">Install & Restart</button></div>') +
    "</section>";
}

function localRunnerPage() {
  const models = snapshot.ollama.models || [];
  const chips = models.length ? '<div class="model-chips">' + models.map((m)=>'<span class="chip">'+esc(m)+"</span>").join("") + "</div>" : '<div class="empty">No Ollama models detected.</div>';
  return pageHead("LOCAL AI","Local Runner","Use models and private compute on your own machine. No hosted CodeHarborX server is required.") +
    '<section class="grid">' +
      card("Ollama","LOCAL LANGUAGE MODEL RUNTIME",stat("Detection",snapshot.ollama.status,"127.0.0.1:11434")) +
      card("Offline mode","LOCAL-FIRST",stat("Core app","Available","project registry + NAS + MCP")) +
      card("Model storage","THIS COMPUTER",stat("Detected",models.length+" models","local only")) +
    "</section>" + card("Detected models","OLLAMA",chips);
}

function githubPage() {
  const repos = (snapshot.data.projects || []).filter((p)=>p.githubRepo);
  return pageHead("SOURCE CONTROL","GitHub Sync","GitHub is source control and the release/update channel. CodeHarborX itself runs locally.") +
    card("Tracked repositories",repos.length+" REPOSITORIES",listRows(repos,"◈",(p)=>({title:p.name,meta:p.githubRepo,status:"Tracked",type:"good"})));
}

function backupsPage() {
  const projects = snapshot.data.projects || [];
  const protectedCount = projects.filter((p)=>p.status==="protected").length;
  return pageHead("RECOVERY","Backup Center","Six-layer recovery tracking across source, database, assets, GitHub snapshots, installers, and restore records.") +
    '<section class="grid">' +
      card("Protection","COMPLETE RECOVERY SETS",stat("Protected",protectedCount+" / "+projects.length,"projects with six layers")) +
      card("NAS destination","UGREEN PROJECT_BACKUPS",stat("Status",snapshot.nasReachable?"Reachable":"Needs attention",snapshot.config.nasRoot)) +
      card("Restore points","VERSIONED RECOVERY RECORDS",stat("Current",projects.filter((p)=>p.latestSnapshot&&p.latestSnapshot.restoreRecord).length,"projects with restore record")) +
    "</section>" +
    card("Project protection matrix","LATEST LOCAL STATE",listRows(projects,"▤",(p)=>({
      title:p.name,meta:projectLayers(p)+"/6 recovery layers · "+(p.lastBackupAt?fmt(p.lastBackupAt):"no backup recorded"),
      status:p.status.replace("_"," "),type:p.status==="protected"?"good":"warn"
    })));
}

function simplePage(key) {
  const cfg = {
    "prompt-lab":["AI WORKBENCH","Prompt Lab","Reusable prompt collections and local model-routing experiments.","Prompt workspace","Prompt collections will be stored locally."],
    "packaging":["RELEASE ENGINEERING","App Packaging","Track installable desktop deliverables, updater metadata, and future operating-system targets.","Windows release pipeline","GitHub Actions produces the standalone Windows installer and updater metadata."],
    "deployments":["DELIVERY","Deployments","Track release and deployment records without a hosted CodeHarborX runtime.","Deployment registry","No deployment records yet."],
    "knowledge":["REFERENCE","Knowledge Base","Keep project notes and local documentation beside the project registry.","Knowledge library","Knowledge entries can be added to the local data model."],
    "assets":["FILES","Asset Library","Track project assets and backup locations from the installed app.","Asset index","No indexed assets yet."]
  }[key];
  return pageHead(cfg[0],cfg[1],cfg[2]) + card(cfg[3],"LOCAL-FIRST",'<div class="empty">'+esc(cfg[4])+"</div>");
}

function analyticsPage() {
  const projects = snapshot.data.projects || [];
  return pageHead("INSIGHTS","Analytics","Local operational summary for this CodeHarborX installation.") +
    '<section class="metrics">' +
      metric("Projects",projects.length,"registered locally") +
      metric("Protected",projects.filter((p)=>p.status==="protected").length,"complete backup sets") +
      metric("AI models",snapshot.ollama.models.length,"detected by Ollama") +
      metric("Workflows",(snapshot.data.workflows||[]).length,"local records") +
      metric("Activity",(snapshot.data.activity||[]).length,"recent events") +
    "</section>";
}

function extensionsPage() {
  const extensions = snapshot.data.extensions || [];
  return pageHead("INTEGRATIONS","Extensions","Local integrations enabled for this installation.") +
    card("Installed extensions",extensions.length+" LOCAL EXTENSIONS",listRows(extensions,"✚",(x)=>({title:x.name,meta:"Runs from this CodeHarborX installation",status:x.enabled?"Enabled":"Disabled",type:x.enabled?"good":"info"})));
}

function teamPage() {
  const team = snapshot.data.team || [];
  return pageHead("ACCESS","Team & Roles","Local role records for the standalone installation.") +
    card("People",team.length+" LOCAL RECORDS",listRows(team,"♙",(x)=>({title:x.name,meta:x.role,status:"Local",type:"good"})));
}

function aiControlPage() {
  return pageHead("MCP / AI CONTROL","ChatGPT & AI Control","Expose only approved local CodeHarborX tools to AI clients using MCP. Your NAS is never exposed directly.") +
    '<section class="grid">' +
      card("MCP tools","SCOPED ACTIONS",stat("Design","Scoped","projects, backups, agents, workflows")) +
      card("Private bridge","LOCALHOST",stat("Exposure","Private-first","127.0.0.1 only")) +
      card("Approval policy","NON-DESTRUCTIVE DEFAULT",stat("Safety","Gated","no delete tools")) +
    "</section>" +
    card("Local MCP endpoint","CONNECTION",'<div class="codebox">http://127.0.0.1:'+snapshot.mcpPort+"/mcp</div><p>CodeHarborX runs this endpoint directly from the installed Windows application.</p>");
}

function settingsPage() {
  return pageHead("SYSTEM","Settings","Configure this local CodeHarborX installation.") +
    card("Local configuration","STORED ON THIS COMPUTER",
      '<div class="settings-form"><div class="field"><label>UGREEN NAS backup root</label><input id="nasRootInput" value="'+esc(snapshot.config.nasRoot)+'"></div>' +
      '<div class="field"><label>Theme</label><select id="themeSelect"><option value="dark" '+(snapshot.config.theme==="dark"?"selected":"")+'>Dark</option><option value="light" '+(snapshot.config.theme==="light"?"selected":"")+'>Light</option></select></div>' +
      '<div class="section-actions"><button class="button primary" id="saveSettings">Save settings</button><button class="button" id="openDataFolder">Open local data folder</button></div>' +
      '<div class="notice"><strong>No hosted runtime:</strong> this configuration and your CodeHarborX records live in the installed application&apos;s Windows data folder.</div></div>') + tunnelSettings();
}

function tunnelSettings() {
  const t = snapshot.tunnel || {};
  return card('ChatGPT tunnel', 'PRIVATE CONNECTION',
    '<p id="tunnelMessage">'+esc(t.message || 'ChatGPT tunnel disconnected')+'</p>' +
    '<div class="settings-form"><div class="field"><label for="tunnelExe">Official tunnel-client executable</label><input id="tunnelExe" readonly value="'+esc(t.executable)+'"><button class="button" id="selectTunnel">Browse…</button></div>' +
    '<div class="field"><label for="tunnelProfile">Existing tunnel profile</label><input id="tunnelProfile" value="'+esc(t.profile || 'codeharborx')+'"></div>' +
    '<div class="field"><label for="tunnelKey">Runtime credential '+(t.credentialSaved ? '(saved securely; leave blank to keep)' : '(required)')+'</label><input id="tunnelKey" type="password" autocomplete="off" spellcheck="false" placeholder="Enter a runtime credential"></div>' +
    '<label><input type="checkbox" id="tunnelAuto" '+(t.autoStart !== false ? 'checked' : '')+'> Start when CodeHarborX opens</label>' +
    '<p>Credentials are encrypted for your Windows account. Only select the official OpenAI client. The selected executable receives the credential when started.</p>' +
    '<div class="section-actions"><button class="button primary" id="saveTunnel">Save tunnel settings</button><button class="button" id="startTunnel">Start</button><button class="button" id="stopTunnel">Stop</button><button class="button" id="restartTunnel">Restart</button><button class="button" id="forgetTunnel">Remove saved credential</button></div></div>');
}

function updateTunnelStatus() {
  const t = snapshot?.tunnel || {};
  $('#tunnelStatus').textContent = t.state === 'connected' ? 'ChatGPT connected' : 'ChatGPT disconnected';
  const message = $('#tunnelMessage'); if (message) message.textContent = t.message || 'ChatGPT tunnel disconnected';
}

function render() {
  if (!snapshot) {
    $("#main").innerHTML = '<div class="empty">Opening your local harbor…</div>';
    return;
  }
  const map = {
    "dashboard":dashboardPage,"command-center":commandPage,"projects":projectsPage,"builder":()=>window.CodeHarborXBuilder.page(builderState,snapshot),"ai-agents":agentsPage,
    "workflows":workflowsPage,"desktop-agents":desktopPage,"local-runner":localRunnerPage,"github-sync":githubPage,
    "backups":backupsPage,"analytics":analyticsPage,"extensions":extensionsPage,"team":teamPage,
    "ai-control":aiControlPage,"settings":settingsPage
  };
  const page = map[route] ? map[route]() : simplePage(route);
  $("#main").innerHTML = page;
  bindActions();
  updateTunnelStatus();
}

function bindActions() {
  const selectTunnel = $('#selectTunnel');
  if (selectTunnel) selectTunnel.onclick = async () => { const selected = await window.codeHarborX.selectTunnelExecutable(); if (selected) $('#tunnelExe').value = selected; };
  const saveTunnel = $('#saveTunnel');
  if (saveTunnel) saveTunnel.onclick = async () => {
    const input = { executable: $('#tunnelExe').value, profile: $('#tunnelProfile').value, autoStart: $('#tunnelAuto').checked, key: $('#tunnelKey').value };
    $('#tunnelKey').value = ''; saveTunnel.disabled = true;
    try { snapshot.tunnel = await window.codeHarborX.configureTunnel(input); render(); }
    catch { showInfo('ChatGPT tunnel', 'Could not save the tunnel settings. Check the official executable, profile and Windows secure storage.'); }
    finally { input.key = ''; saveTunnel.disabled = false; }
  };
  for (const [id, method] of [['startTunnel','startTunnel'],['stopTunnel','stopTunnel'],['restartTunnel','restartTunnel'],['forgetTunnel','forgetTunnelCredential']]) {
    const button = $('#'+id);
    if (button) button.onclick = async () => { button.disabled = true; try { snapshot.tunnel = await window.codeHarborX[method](); render(); } catch { showInfo('ChatGPT tunnel', 'Tunnel operation failed. Check your local settings.'); } finally { button.disabled = false; } };
  }
  document.querySelectorAll("[data-go]").forEach((b)=>b.onclick=()=>navigate(b.dataset.go));
  document.querySelectorAll("#newProject").forEach((b)=>b.onclick=openProjectModal);
  document.querySelectorAll("#openDataFolder").forEach((b)=>b.onclick=()=>window.codeHarborX.openDataFolder());

  const testNas = $("#testNas");
  if (testNas) testNas.onclick = async () => {
    const result = await window.codeHarborX.testNas(snapshot.config.nasRoot);
    showInfo("NAS test",result.reachable ? "NAS is reachable." : "NAS is not reachable.");
    await refresh();
  };

  const scanNas = $("#scanNas");
  if (scanNas) scanNas.onclick = async () => {
    try {
      const items = await window.codeHarborX.scanBackups(snapshot.config.nasRoot);
      showInfo("Backup scan",items.map((x)=>x.category+": "+(x.exists?x.projects+" project folder(s), "+x.files+" item(s)":"folder missing")).join("\n"));
    } catch (error) {
      showInfo("Backup scan",error.message || String(error));
    }
  };

  const checkOllama = $("#checkOllama");
  if (checkOllama) checkOllama.onclick = async () => {
    await refresh();
    showInfo("Local AI",snapshot.ollama.status==="online" ? "Ollama online · "+snapshot.ollama.models.length+" model(s)" : "Ollama is offline.");
  };

  const checkUpdates = $("#checkUpdates");
  if (checkUpdates) checkUpdates.onclick = async () => {
    checkUpdates.textContent = "Checking…";
    try { await window.codeHarborX.checkForUpdates(); } catch (error) { showInfo("Updates",error.message || String(error)); }
  };

  const installUpdate = $("#installUpdate");
  if (installUpdate) installUpdate.onclick = () => window.codeHarborX.installUpdate();

  const saveSettings = $("#saveSettings");
  if (saveSettings) saveSettings.onclick = async () => {
    const config = await window.codeHarborX.saveConfig({ nasRoot:$("#nasRootInput").value, theme:$("#themeSelect").value });
    document.documentElement.dataset.theme = config.theme;
    await refresh();
    showInfo("Settings","Settings saved locally.");
  };

  if (route === "builder" && window.CodeHarborXBuilder) {
    window.CodeHarborXBuilder.bind({
      rerender: render,
      showInfo,
      showModal,
      closeModal,
      navigate,
      setState: (state) => { builderState = state; }
    });
  }
}

function openProjectModal() {
  showModal(
    "<h2>Add project</h2><p>Create a project record in this computer&apos;s standalone CodeHarborX data store.</p>" +
    '<div class="settings-form">' +
      '<div class="field"><label>Project name</label><input id="pName" placeholder="My project"></div>' +
      '<div class="field"><label>Source type</label><select id="pType"><option value="github">GitHub</option><option value="local">Local</option><option value="legacy_import">Imported legacy project</option></select></div>' +
      '<div class="field"><label>GitHub repository (optional)</label><input id="pRepo" placeholder="owner/repository"></div>' +
      '<div class="field"><label>Local project path (optional)</label><input id="pLocal" placeholder="C:\\\\Projects\\\\MyApp"></div>' +
      '<div class="field"><label>NAS project path (optional)</label><input id="pNas" placeholder="\\\\\\\\NAS\\\\Project_Backups\\\\MyApp"></div>' +
      '<button class="button primary" id="createProject">Create project</button></div>'
  );
  $("#createProject").onclick = async () => {
    try {
      await window.codeHarborX.addProject({
        name:$("#pName").value,sourceType:$("#pType").value,githubRepo:$("#pRepo").value,
        localPath:$("#pLocal").value,nasPath:$("#pNas").value
      });
      closeModal();
      await refresh();
      navigate("projects");
    } catch (error) {
      showInfo("Project",error.message || String(error));
    }
  };
}
function showModal(content) {
  $("#modalBody").innerHTML = content;
  $("#modal").classList.remove("hidden");
  $("#modal").setAttribute("aria-hidden","false");
}
function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal").setAttribute("aria-hidden","true");
}
function showInfo(title, text) {
  showModal("<h2>"+esc(title)+"</h2><p>Local CodeHarborX result</p><div class=\"codebox\" style=\"white-space:pre-wrap\">"+esc(text)+"</div>");
}

document.querySelectorAll("[data-close-modal]").forEach((x)=>x.onclick=closeModal);
$("#themeToggle").onclick = async () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  await window.codeHarborX.saveConfig({ theme, nasRoot:snapshot.config.nasRoot });
  document.documentElement.dataset.theme = theme;
  await refresh();
};
$("#globalSearch").addEventListener("keydown",(event)=>{
  if (event.key !== "Enter") return;
  const query = event.target.value.trim().toLowerCase();
  const match = NAV.find((x)=>x[1].toLowerCase().includes(query));
  if (match) {
    navigate(match[0]);
    event.target.value = "";
  }
});
document.addEventListener("keydown",(event)=>{
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="k") {
    event.preventDefault();
    $("#globalSearch").focus();
  }
  if (event.key==="Escape") closeModal();
});
window.addEventListener("hashchange",()=>{
  route=(location.hash||"#dashboard").slice(1);
  drawNav();
  render();
});

async function refresh() {
  const results = await Promise.all([window.codeHarborX.getSnapshot(), window.codeHarborX.builderStatus()]);
  snapshot = results[0];
  builderState = results[1];
  document.documentElement.dataset.theme = snapshot.config.theme;
  $("#versionPill").textContent = "v" + snapshot.appVersion;
  $("#harborStatus").textContent = snapshot.nasReachable ? "Harbor online" : "Harbor local";
  render();
}

window.codeHarborX.onUpdateStatus((status)=>{
  if (snapshot) snapshot.updateStatus = status;
  const text = $("#updateText");
  if (text) text.textContent = status.message || status.state;
  const install = $("#installUpdate");
  if (install) install.style.display = status.state === "ready" ? "" : "none";
});
window.codeHarborX.onTunnelStatus(status => {
  if (snapshot) snapshot.tunnel = { ...snapshot.tunnel, ...status };
  updateTunnelStatus();
});
window.codeHarborX.onPlatformStatus((status)=>{
  snapshot = status;
  render();
});

drawNav();
refresh().catch((error)=>{
  $("#main").innerHTML = '<div class="empty">CodeHarborX could not load local data: '+esc(error.message || String(error))+"</div>";
});
