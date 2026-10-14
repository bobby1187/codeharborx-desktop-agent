const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPackaging, inspectProject, copyWeb } = require('../src/packaging');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'codeharborx-package-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'project'), web=path.join(source,'dist');
  await fs.mkdir(web,{recursive:true});await fs.writeFile(path.join(web,'index.html'),'<h1>App</h1>');
  return {root,source,web};
}
test('finds built output and rejects unbuilt projects without running project scripts',async t=>{
  const f=await fixture(t);assert.equal((await inspectProject(f.source)).web,f.web);
  await fs.rm(path.join(f.web,'index.html'));await assert.rejects(inspectProject(f.source),/Build your frontend first/);
});
test('copies public assets, excludes secrets/dependencies, and refuses linked assets',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.web,'.env'),'secret');await fs.writeFile(path.join(f.web,'private.key'),'secret');
  await fs.mkdir(path.join(f.web,'node_modules'));await fs.writeFile(path.join(f.web,'node_modules','private.js'),'private');
  const out=path.join(f.root,'copy');await copyWeb(f.web,out);assert.deepEqual(await fs.readdir(out),['index.html']);
  await fs.symlink(f.web,path.join(f.web,'linked-assets'),'junction');
  await assert.rejects(copyWeb(f.web,path.join(f.root,'copy2')),/Linked files/);
});
test('stages a desktop wrapper, passes target options, verifies artifacts, and preserves source',async t=>{
  const f=await fixture(t);let config;
  const manager=createPackaging({directory:path.join(f.root,'packages'),platform:'linux',resolveTool:()=>'/mock/builder',run:async(command,args,options)=>{
    assert.equal(options.env.ELECTRON_NO_ASAR,'1');
    assert.equal(path.dirname(args[0]),args[2]);
    assert.match(await fs.readFile(args[0],'utf8'),/require\(tool\)/);
    config=JSON.parse(await fs.readFile(path.join(args[2],'build-config.json'),'utf8'));
    assert.deepEqual(config.linux,['AppImage','deb']);assert.equal(config.publish,'never');
    const pkg=JSON.parse(await fs.readFile(path.join(config.projectDir,'package.json'),'utf8'));assert.equal(pkg.productName,'My Platform');
    assert.match(await fs.readFile(path.join(config.projectDir,'main.js'),'utf8'),/sandbox:true/);
    await fs.mkdir(config.config.directories.output,{recursive:true});await fs.writeFile(path.join(config.config.directories.output,'app.AppImage'),'artifact');await fs.writeFile(path.join(config.config.directories.output,'app.deb'),'artifact');
  },openPath:async folder=>{assert.equal(folder,config.config.directories.output);return '';}});
  await manager.select(f.source);const result=await manager.build({name:'My Platform',version:'1.2.3',target:'linux'});
  assert.equal(result.status,'complete');assert.equal(result.artifacts.length,2);await manager.reveal(0);
  const restored=createPackaging({directory:path.join(f.root,'packages')});
  assert.equal((await restored.init()).artifacts.length,2);
  assert.equal(await fs.readFile(path.join(f.web,'index.html'),'utf8'),'<h1>App</h1>');
  await assert.rejects(fs.access(config.projectDir));
  await assert.rejects(manager.build({name:'x',version:'1.0.0',target:'macos'}),/built on a Mac/);
  await assert.rejects(manager.build({name:'../x',version:'1.0.0',target:'linux'}),/app name/);
});
test('serializes builds and rejects false success when no installer is created',async t=>{
  const f=await fixture(t);let release;
  const wait=new Promise(resolve=>{release=resolve});
  const manager=createPackaging({directory:path.join(f.root,'packages'),resolveTool:()=>'/mock/builder',run:async()=>wait});
  await manager.select(f.source);const build=manager.build({name:'App',version:'1.0.0',target:'linux'});
  await assert.rejects(manager.build({name:'App',version:'1.0.0',target:'linux'}),/already building/);
  await assert.rejects(manager.select(f.source),/current package/);release();
  assert.equal((await build).status,'failed');assert.equal(manager.isBusy(),false);
});

for (const [host,target,key,format,extension] of [['win32','windows','win','nsis','.exe'],['darwin','macos','mac','dmg','.dmg']]) {
  test(`selects ${target} native installer format`,async t=>{
    const f=await fixture(t);
    const manager=createPackaging({directory:path.join(f.root,'packages'),platform:host,resolveTool:()=>'/mock/builder',run:async(command,args)=>{
      const config=JSON.parse(await fs.readFile(path.join(args[2],'build-config.json'),'utf8'));
      assert.deepEqual(config[key],[format]);
      await fs.mkdir(config.config.directories.output,{recursive:true});
      await fs.writeFile(path.join(config.config.directories.output,'App'+extension),'artifact');
    }});
    await manager.select(f.source);
    assert.equal((await manager.build({name:'App',version:'1.0.0',target})).status,'complete');
  });
}
