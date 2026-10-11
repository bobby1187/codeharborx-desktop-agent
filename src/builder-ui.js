(function(){
  let selectedProject = null;
  let files = [];
  let selectedFile = null;
  let fileContent = "";
  let busy = false;

  const e = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));

  function projectCard(project) {
    const preview = project.preview && project.preview.running ? '<span class="badge good">Preview live</span>' : '<span class="badge info">Local</span>';
    return '<article class="builder-project-card" data-builder-open="'+e(project.id)+'"><div><small>'+e(project.template.toUpperCase())+'</small><h3>'+e(project.name)+'</h3><p>'+e(project.path)+'</p></div><div>'+preview+' <button class="mini-button danger" data-builder-delete="'+e(project.id)+'" '+(busy?'disabled':'')+'>Delete</button></div></article>';
  }

  function fileButtons() {
    if (!files.length) return '<div class="empty">No files yet.</div>';
    return files.map(file => '<button class="builder-file '+(file===selectedFile?"active":"")+'" data-builder-file="'+e(file)+'">'+e(file)+'</button>').join("");
  }

  function modelOptions(snapshot) {
    const models = snapshot && snapshot.ollama && snapshot.ollama.models || [];
    if (!models.length) return '<option value="">No Ollama models detected</option>';
    return models.map(model => '<option value="'+e(model)+'">'+e(model)+'</option>').join("");
  }

  function page(state, snapshot) {
    const projects = state && state.projects || [];
    const active = selectedProject ? projects.find(p => p.id === selectedProject) : null;
    let html = '<div class="page-title"><div><span class="eyebrow">LOCAL DEVELOPMENT STUDIO</span><h1>Builder</h1><p>Create websites and web platforms locally, edit the source, generate changes with Ollama, preview on localhost, and expose the project through CodeHarborX MCP tools.</p></div><div class="section-actions"><button class="button primary" id="builderNew">＋ New Builder Project</button></div></div>';

    if (!projects.length) {
      html += '<section class="builder-welcome"><div><span class="eyebrow">CODEHARBORX BUILDER</span><h2>Build without leaving your computer.</h2><p>Start with a website or dashboard template. Project files live in the local Builder workspace and can be edited by you, local AI, or an approved MCP client.</p><button class="button primary" id="builderNewEmpty">Create your first project</button></div><img src="../build/logo.png" alt="CodeHarborX"></section>';
      return html;
    }

    html += '<section class="builder-projects">'+projects.map(projectCard).join("")+'</section>';

    if (!active) {
      html += '<div class="notice" style="margin-top:14px"><strong>Select a Builder project</strong> to open its files, local AI prompt, and live preview.</div>';
      return html;
    }

    const previewUrl = active.preview && active.preview.running ? active.preview.url : "";
    html += '<section class="builder-studio">' +
      '<aside class="builder-files"><div class="builder-pane-head"><div><small>PROJECT</small><b>'+e(active.name)+'</b></div><button class="mini-button" id="builderOpenFolder">Folder</button></div><div class="builder-file-list">'+fileButtons()+'</div></aside>' +
      '<div class="builder-editor"><div class="builder-pane-head"><div><small>EDITOR</small><b>'+e(selectedFile || "Choose a file")+'</b></div><div><button class="mini-button" id="builderRefreshFiles">Refresh</button> <button class="mini-button danger" id="builderDeleteFile" '+(!selectedFile||busy?'disabled':'')+'>Delete file</button> <button class="mini-button primary" id="builderSave" '+(!selectedFile?"disabled":"")+'>Save</button></div></div>' +
      '<textarea id="builderEditor" spellcheck="false" placeholder="Choose a file from the left.">'+e(fileContent)+'</textarea>' +
      '<div class="builder-ai"><div class="field"><label>Local AI model</label><select id="builderModel">'+modelOptions(snapshot)+'</select></div><div class="field grow"><label>Tell CodeHarborX what to build or change</label><textarea id="builderPrompt" placeholder="Example: Turn this into a modern Afghan restaurant website with a menu, grocery store section, contact area, and mobile layout."></textarea></div><button class="button primary" id="builderGenerate" '+(busy?"disabled":"")+'>'+(busy?"Building…":"Build with Local AI")+'</button></div></div>' +
      '<div class="builder-preview"><div class="builder-pane-head"><div><small>LIVE PREVIEW</small><b>'+(previewUrl?e(previewUrl):"Not running")+'</b></div><div><button class="mini-button" id="builderPreview">'+(previewUrl?"Restart":"Start")+'</button> '+(previewUrl?'<button class="mini-button danger" id="builderStopPreview">Stop</button>':"")+'</div></div>' +
      (previewUrl?'<iframe src="'+e(previewUrl)+'" title="Builder preview"></iframe>':'<div class="builder-preview-empty"><div>◫</div><b>Local preview is stopped</b><span>Start it to see your website running on this computer.</span></div>') +
      '</div></section>';

    return html;
  }

  async function reloadState(ctx) {
    const state = await window.codeHarborX.builderStatus();
    ctx.setState(state);
    ctx.rerender();
  }

  async function loadFiles(ctx, projectId, preferred) {
    files = await window.codeHarborX.builderListFiles(projectId);
    if (preferred && files.includes(preferred)) selectedFile = preferred;
    else if (!selectedFile || !files.includes(selectedFile)) selectedFile = files.includes("index.html") ? "index.html" : (files[0] || null);
    if (selectedFile) {
      const result = await window.codeHarborX.builderReadFile(projectId, selectedFile);
      fileContent = result.content;
    } else fileContent = "";
    ctx.rerender();
  }

  function newProject(ctx) {
    ctx.showModal('<h2>New Builder Project</h2><p>Create a local project you can edit, preview, and control through MCP.</p><div class="settings-form"><div class="field"><label>Project name</label><input id="builderProjectName" placeholder="My new website"></div><div class="field"><label>Starter</label><select id="builderTemplate"><option value="website">Professional Website</option><option value="dashboard">Web Platform / Dashboard</option></select></div><button class="button primary" id="builderCreateNow">Create & Open</button></div>');
    document.querySelector("#builderCreateNow").onclick = async () => {
      try {
        const result = await window.codeHarborX.builderCreate({ name:document.querySelector("#builderProjectName").value, template:document.querySelector("#builderTemplate").value });
        ctx.closeModal();
        selectedProject = result.id;
        selectedFile = null;
        await reloadState(ctx);
        await loadFiles(ctx, result.id, "index.html");
      } catch (err) { ctx.showInfo("Builder",err.message || String(err)); }
    };
  }

  function bind(ctx) {
    document.querySelectorAll('[data-builder-delete]').forEach(button => button.onclick = async event => {
      event.stopPropagation();
      const id = button.dataset.builderDelete;
      button.disabled = true;
      try {
        const result = await window.codeHarborX.builderDeleteProject(id);
        if (result.canceled) return;
        if (selectedProject === id) { selectedProject = null; selectedFile = null; files = []; fileContent = ''; }
        await reloadState(ctx);
      } catch (error) { ctx.showInfo('Delete project', error.message || String(error)); }
      finally { button.disabled = false; }
    });
    const deleteFile = document.querySelector('#builderDeleteFile');
    if (deleteFile) deleteFile.onclick = async () => {
      deleteFile.disabled = true;
      try {
        const result = await window.codeHarborX.builderDeleteFile(selectedProject, selectedFile);
        if (result.canceled) return;
        selectedFile = null; fileContent = '';
        await reloadState(ctx); await loadFiles(ctx, selectedProject);
      } catch (error) { ctx.showInfo('Delete file', error.message || String(error)); }
      finally { deleteFile.disabled = false; }
    };
    document.querySelectorAll("#builderNew,#builderNewEmpty").forEach(b => b.onclick = () => newProject(ctx));
    document.querySelectorAll("[data-builder-open]").forEach(b => b.onclick = async () => {
      selectedProject = b.dataset.builderOpen;
      selectedFile = null;
      await loadFiles(ctx, selectedProject, "index.html");
    });
    document.querySelectorAll("[data-builder-file]").forEach(b => b.onclick = async () => {
      selectedFile = b.dataset.builderFile;
      const result = await window.codeHarborX.builderReadFile(selectedProject, selectedFile);
      fileContent = result.content;
      ctx.rerender();
    });

    const save = document.querySelector("#builderSave");
    if (save) save.onclick = async () => {
      try {
        fileContent = document.querySelector("#builderEditor").value;
        await window.codeHarborX.builderWriteFile(selectedProject, selectedFile, fileContent);
        ctx.showInfo("Builder","Saved "+selectedFile+" locally.");
        await reloadState(ctx);
      } catch (err) { ctx.showInfo("Builder",err.message || String(err)); }
    };

    const refreshFiles = document.querySelector("#builderRefreshFiles");
    if (refreshFiles) refreshFiles.onclick = () => loadFiles(ctx, selectedProject, selectedFile);

    const folder = document.querySelector("#builderOpenFolder");
    if (folder) folder.onclick = () => window.codeHarborX.builderOpenFolder(selectedProject);

    const preview = document.querySelector("#builderPreview");
    if (preview) preview.onclick = async () => {
      try {
        await window.codeHarborX.builderStopPreview(selectedProject);
        await window.codeHarborX.builderStartPreview(selectedProject);
        await reloadState(ctx);
      } catch (err) { ctx.showInfo("Preview",err.message || String(err)); }
    };
    const stop = document.querySelector("#builderStopPreview");
    if (stop) stop.onclick = async () => {
      await window.codeHarborX.builderStopPreview(selectedProject);
      await reloadState(ctx);
    };

    const generate = document.querySelector("#builderGenerate");
    if (generate) generate.onclick = async () => {
      const prompt = document.querySelector("#builderPrompt").value.trim();
      const model = document.querySelector("#builderModel").value;
      if (!prompt) return ctx.showInfo("Builder","Tell CodeHarborX what you want it to build.");
      if (!model) return ctx.showInfo("Builder","No Ollama model is available. Start Ollama or install a local model first.");
      busy = true; ctx.rerender();
      try {
        const result = await window.codeHarborX.builderGenerate({ projectId:selectedProject, prompt, model });
        busy = false;
        await reloadState(ctx);
        await loadFiles(ctx, selectedProject, selectedFile || "index.html");
        ctx.showInfo("Builder","Local AI updated: "+result.files.join(", "));
      } catch (err) {
        busy = false; ctx.rerender();
        ctx.showInfo("Builder",err.message || String(err));
      }
    };
  }

  window.CodeHarborXBuilder = { page, bind };
})();
