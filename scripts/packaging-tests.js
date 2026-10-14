// Preserve the test exit status and expose native failures in CI annotations.
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/packaging.test.js'], { encoding:'utf8', maxBuffer:1024*1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
if (result.status !== 0 && process.env.GITHUB_ACTIONS) {
  const message = ((result.stdout || '') + (result.stderr || '')).slice(-16000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
  console.error('::error title=Packaging tests failed::'+message);
}
process.exitCode = result.status === null ? 1 : result.status;
