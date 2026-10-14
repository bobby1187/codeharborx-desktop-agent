// Run in a separate Node process so packaging never blocks the desktop UI.
const fs = require('node:fs');
const [tool, directory] = process.argv.slice(2);
const { build } = require(tool);
const config = JSON.parse(fs.readFileSync(require('node:path').join(directory, 'build-config.json'), 'utf8'));
build(config).then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
