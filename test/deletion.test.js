const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createBuilder } = require('../src/builder');
const { removeRecord } = require('../src/records');

async function setup(t) {
  const testRoot = path.resolve('.test-work'); await fs.mkdir(testRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(testRoot, 'codeharborx-delete-'));
  assert.equal(path.dirname(directory), testRoot);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const trashed = [];
  const builder = createBuilder({ userDataPath: directory, shell: { trashItem: async target => {
    assert.equal(target.startsWith(path.join(directory, 'builder-workspaces') + path.sep), true);
    const destination = path.join(directory, `recycled-${trashed.length}`);
    await fs.rename(target, destination); trashed.push({ target, destination });
  } } });
  t.after(() => builder.closeAll());
  const project = await builder.createProject({ name: 'Test website' });
  return { builder, project, directory, trashed };
}
test('project deletion recycles files, stops preview and leaves other projects intact', async t => {
  const { builder, project, trashed } = await setup(t);
  const other = await builder.createProject({ name: 'Keep me' });
  const preview = await builder.startPreview(project.id);
  assert.equal((await builder.status()).projects.find(p => p.id === project.id).preview.running, true);
  if (process.env.CI) { const response = await fetch(preview.url); assert.equal(response.ok, true); await response.text(); }
  await builder.deleteProject(project.id);
  assert.equal(trashed.length, 1);
  assert.equal((await builder.status()).projects[0].id, other.id);
  assert.equal((await fs.readFile(path.join(trashed[0].destination, 'index.html'), 'utf8')).includes('Test website'), true);
  if (process.env.CI) await assert.rejects(fetch(preview.url));
  await assert.rejects(builder.writeFile(project.id, 'index.html', 'must not recreate'));
  const recreated = await builder.createProject({ name: 'Test website' });
  assert.equal(recreated.id, project.id);
  assert.equal((await builder.status()).projects.find(p => p.id === project.id).preview.running, false);
});
test('file deletion recycles just the selected file and preserves manifest and siblings', async t => {
  const { builder, project, trashed } = await setup(t);
  await builder.writeFile(project.id, 'images/note.txt', 'recover me');
  await builder.deleteFile(project.id, 'images/note.txt');
  assert.equal(await fs.readFile(trashed[0].destination, 'utf8'), 'recover me');
  assert.deepEqual(await builder.listFiles(project.id), ['index.html', 'styles.css']);
  assert.equal((await builder.status()).projects.length, 1);
});
test('deletion rejects workspace escape, slug aliases, metadata and directory targets', async t => {
  const { builder, project, trashed } = await setup(t);
  for (const id of ['../test-website', 'Test website', '', '.', 'test-website/other']) await assert.rejects(builder.deleteProject(id));
  for (const rel of ['../outside.txt', 'index.html:secret', '.codeharborx.json', '', '/', 'folder/../index.html', 'C:\\outside.txt']) await assert.rejects(builder.deleteFile(project.id, rel));
  assert.equal(trashed.length, 0);
});
test('deletion refuses junctions leading outside a project', async t => {
  const { builder, project, directory, trashed } = await setup(t);
  const outside = path.join(directory, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'safe');
  try { await fs.symlink(outside, path.join(directory, 'builder-workspaces', project.id, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM' && !process.env.CI) { t.skip('Local sandbox does not permit junction creation; Windows release CI runs this check.'); return; } throw error; }
  await assert.rejects(builder.deleteFile(project.id, 'linked/keep.txt'));
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'safe');
  assert.equal(trashed.length, 0);
});
test('a failed Recycle Bin operation leaves project files available', async t => {
  const { directory, project } = await setup(t);
  const builder = createBuilder({ userDataPath: directory, shell: { trashItem: async () => { throw new Error('Trash unavailable'); } } });
  await assert.rejects(builder.deleteProject(project.id), /Trash unavailable/);
  assert.equal((await builder.status()).projects.length, 1);
});
test('deletion is blocked while a local build is in progress', async t => {
  const { builder, project, trashed } = await setup(t);
  const originalFetch = global.fetch;
  let release; const gate = new Promise(resolve => { release = resolve; });
  global.fetch = async () => { await gate; return { ok: true, json: async () => ({ response: JSON.stringify({ files: [{ path: 'index.html', content: 'built' }] }) }) }; };
  try {
    const generation = builder.generate({ projectId: project.id, prompt: 'Test build', model: 'fixture' });
    await assert.rejects(builder.deleteProject(project.id), /build to finish/);
    assert.equal(trashed.length, 0); release(); await generation;
    await builder.deleteProject(project.id); assert.equal(trashed.length, 1);
  } finally { release(); global.fetch = originalFetch; }
});
test('registry deletion removes only a record and preserves external paths and owner', () => {
  const data = { projects: [{ id: 'one', name: 'Remove', localPath: 'C:\\source' }, { id: 'two', name: 'Keep' }], team: [{ id: 'owner' }], agents: [], workflows: [] };
  const result = removeRecord(data, 'projects', 'one');
  assert.equal(result.data.projects.length, 1); assert.equal(data.projects.length, 2);
  assert.equal(result.record.localPath, 'C:\\source');
  assert.throws(() => removeRecord(data, 'team', 'owner'));
  assert.throws(() => removeRecord(data, 'extensions', 'github'));
  assert.throws(() => removeRecord(data, '__proto__', 'one'));
  assert.throws(() => removeRecord(data, 'projects', 'unknown'));
});
