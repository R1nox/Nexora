'use strict';
// Packs every extensions/<id> folder into a signed .wcx package and writes repository/index.json.
// Signature = Ed25519 over "<id>\n<version>\n<sha256-of-package>". The matching public key is embedded in the app.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const AdmZip = require('adm-zip');
const root = path.join(__dirname, '..');
const extDir = path.join(root, 'extensions'), outDir = path.join(root, 'repository'), shared = path.join(root, 'shared');
const keysDir = path.join(root, 'keys');
fs.mkdirSync(keysDir, { recursive: true }); fs.mkdirSync(path.join(outDir, 'packages'), { recursive: true });

// signing key – generated once, KEEP keys/repo-private.pem SECRET and backed up: it is needed to publish updates
const privPath = path.join(keysDir, 'repo-private.pem'), pubPath = path.join(keysDir, 'repo-public.pem');
if (!fs.existsSync(privPath)) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('generated new signing key pair');
}
const priv = crypto.createPrivateKey(fs.readFileSync(privPath));
const pubPem = fs.readFileSync(pubPath, 'utf8');
const keyId = 'wch-official-' + crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 8);
fs.writeFileSync(path.join(root, 'src', 'main', 'trusted-keys.json'), JSON.stringify([{ id: keyId, name: 'Windows Customization Hub (official)', publicKeyPem: pubPem }], null, 2));

const b64 = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
const index = { format: 'wch-repository', version: 1, name: 'Windows Customization Hub — official', updated: new Date().toISOString(), extensions: [] };
for (const id of fs.readdirSync(extDir).sort()) {
  const d = path.join(extDir, id); if (!fs.statSync(d).isDirectory()) continue;
  const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));
  const zip = new AdmZip();
  const add = (file, name) => zip.addFile(name, fs.readFileSync(file));
  for (const f of fs.readdirSync(d)) add(path.join(d, f), f);
  if (m.windows && m.windows.length) for (const f of ['base.css', 'base.js']) add(path.join(shared, f), f);
  const buf = zip.toBuffer();
  const file = `packages/${id}-${m.version}.wcx`;
  fs.writeFileSync(path.join(outDir, file), buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const sig = crypto.sign(null, Buffer.from(`${id}\n${m.version}\n${sha}`), priv).toString('base64');
  index.extensions.push({
    id, name: m.name, version: m.version, apiVersion: m.apiVersion, author: m.author, category: m.category, description: m.description,
    permissions: m.permissions, dependencies: m.dependencies || {}, compat: m.compat || { windows: ['10', '11'], minBuild: 17763 }, changelog: m.changelog || [], minHub: '1.0.0',
    size: buf.length, package: file, sha256: sha, signature: sig, keyId,
    icon: b64(path.join(d, 'icon.svg'), 'image/svg+xml'), preview: b64(path.join(d, 'preview.svg'), 'image/svg+xml'),
  });
  console.log(`packed ${id}@${m.version}  ${(buf.length / 1024).toFixed(1)} KB`);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`repository ready: ${index.extensions.length} packages, key ${keyId}`);
