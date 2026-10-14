window.CodeHarborXPackaging = (() => {
  let state = { status:'idle', artifacts:[], log:'', host:'', project:null };
  let form = { name:'', version:'1.0.0', target:'windows' };
  const labels = { windows:'Windows (.exe installer)', macos:'macOS (.dmg disk image)', linux:'Linux (.deb + .AppImage)' };
  function update(next) { state = next; }
  function page() {
    const busy = state.status === 'building';
    return pageHead('RELEASE ENGINEERING', 'App Packaging', 'Turn a built web project into a desktop app for the operating system you choose.') +
      card('Create a desktop package', 'LOCAL PROJECT',
        '<p>Select your built frontend folder. CodeHarborX finds index.html in the root, dist, build, or public folder. Build framework projects first; server backends remain separate.</p>' +
        '<div class="settings-form"><div class="field"><label>Project folder</label><div id="packageFolder" class="codebox">'+esc(state.project?.source || 'No folder selected')+'</div><button class="button" id="packageSelect" '+(busy?'disabled':'')+'>Choose folder…</button></div>' +
        '<div class="field"><label for="packageName">App name</label><input id="packageName" value="'+esc(form.name)+'" '+(busy?'disabled':'')+'></div>' +
        '<div class="field"><label for="packageVersion">Version</label><input id="packageVersion" value="'+esc(form.version)+'" placeholder="1.0.0" '+(busy?'disabled':'')+'></div>' +
        '<div class="field"><label for="packageTarget">Target operating system</label><select id="packageTarget" '+(busy?'disabled':'')+'>'+Object.entries(labels).map(([id,label])=>'<option value="'+id+'" '+(id===form.target?'selected':'')+'>'+label+'</option>').join('')+'</select></div>' +
        '<p id="packageRequirements"></p><p>Packages target Intel / AMD 64-bit computers. Node.js with npm and internet access are needed to install packaging tools on the first build. Packages are unsigned; distribution signing and macOS notarization are separate steps. Include only files intended for distribution: hidden files, source-control folders, dependencies, and private key files are excluded.</p>' +
        '<button class="button primary" id="packageBuild" '+(busy || !state.project?'disabled':'')+'>'+(busy?'Building…':'Create package')+'</button></div>') +
      card('Build status', 'INSTALLABLE OUTPUT', '<p id="packageMessage" role="status" aria-live="polite">'+esc(state.message)+'</p><div id="packageArtifacts"></div><details><summary>Build log</summary><pre id="packageLog" class="codebox" style="white-space:pre-wrap;max-height:300px;overflow:auto">'+esc(state.log)+'</pre></details>');
  }
  function paint() {
    const busy = state.status === 'building';
    for (const id of ['packageSelect','packageName','packageVersion','packageTarget']) { const el=document.getElementById(id); if (el) el.disabled=busy; }
    const button=document.getElementById('packageBuild');
    if (button) { button.disabled=busy || !state.project || (form.target==='macos' && state.host!=='darwin'); button.textContent=busy?'Building…':'Create package'; }
    const requirements=document.getElementById('packageRequirements');
    if (requirements) requirements.textContent=form.target==='macos' ? 'macOS packages must be built on a Mac running CodeHarborX.' : form.target==='windows' && state.host!=='win32' ? 'Windows cross builds may require Wine. Building on Windows is recommended.' : form.target==='linux' ? 'Open the .deb installer on Debian / Ubuntu. For other Linux distributions, use the portable AppImage and allow it to run as an executable.' : 'The Windows installer lets you choose an installation folder and creates shortcuts.';
    const message=document.getElementById('packageMessage');if(message)message.textContent=state.message;
    const log=document.getElementById('packageLog');if(log)log.textContent=state.log;
    const artifacts=document.getElementById('packageArtifacts');
    if(artifacts) {
      artifacts.innerHTML=state.artifacts.map((artifact,index)=>'<p>'+esc(artifact)+' <button class="button" data-package-reveal="'+index+'">Show in folder</button></p>').join('');
      artifacts.querySelectorAll('[data-package-reveal]').forEach(button=>button.onclick=async()=>{try { const error=await window.codeHarborX.revealPackage(Number(button.dataset.packageReveal)); if(error)showInfo('Open package folder',error); }catch(error){showInfo('Open package folder',error.message);}});
    }
  }
  function bind({ render, showInfo }) {
    for(const [id,key] of [['packageName','name'],['packageVersion','version'],['packageTarget','target']])document.getElementById(id).oninput=event=>{form[key]=event.target.value;paint();};
    document.getElementById('packageSelect').onclick=async()=>{try {update(await window.codeHarborX.selectPackagingFolder());if(state.project)form.name=state.project.name;render();}catch(error){showInfo('Select project',error.message);}};
    document.getElementById('packageBuild').onclick=async()=>{
      const button=document.getElementById('packageBuild');button.disabled=true;
      try {update(await window.codeHarborX.buildPackage({...form}));paint();}catch(error){showInfo('Create package',error.message);paint();}
    };
    paint();
  }
  return { page, bind, update, paint };
})();
