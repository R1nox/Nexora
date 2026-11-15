// Usage: node scripts/make-release.js <owner/repo> ["note 1" "note 2" ...]
// Creates dist/update.json for the installer in dist/. Upload BOTH files to the GitHub release v<version>.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
let [repo, ...notes] = process.argv.slice(2);
const nf = path.join(__dirname, '..', 'RELEASE_NOTES.txt');
if (!notes.length && fs.existsSync(nf)) notes = fs.readFileSync(nf, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) { console.error('usage: node scripts/make-release.js owner/repo [notes...]'); process.exit(1); }
const root = path.join(__dirname, '..'); const ver = require(path.join(root, 'package.json')).version;
const file = `WindowsCustomizationHub-Setup-${ver}.exe`; const buf = fs.readFileSync(path.join(root, 'dist', file));
const j = { version: ver, notes, url: `https://github.com/${repo}/releases/download/v${ver}/${file}`, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
fs.writeFileSync(path.join(root, 'dist', 'update.json'), JSON.stringify(j, null, 2));
console.log(j);
