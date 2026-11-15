// Offline self-test of the security-critical and pure logic parts (runs on any OS, no Electron needed).
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const AdmZip = require('adm-zip');
const root = path.join(__dirname, '..'); let n = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } };
console.log('selftest');
const idx = JSON.parse(fs.readFileSync(path.join(root, 'repository/index.json'), 'utf8'));
const keys = JSON.parse(fs.readFileSync(path.join(root, 'src/main/trusted-keys.json'), 'utf8'));
ok('repository has 10 extensions', () => assert.strictEqual(idx.extensions.length, 10));
const verify = (e, buf) => { const sha = crypto.createHash('sha256').update(buf).digest('hex'); const t = keys.find((k) => k.id === e.keyId); if (!t) return false; try { return crypto.verify(null, Buffer.from(`${e.id}\n${e.version}\n${sha}`), crypto.createPublicKey(t.publicKeyPem), Buffer.from(e.signature, 'base64')); } catch { return false; } };
for (const e of idx.extensions) {
  const buf = fs.readFileSync(path.join(root, 'repository', e.package));
  ok(`${e.id}: signature valid`, () => assert(verify(e, buf)));
  ok(`${e.id}: tampered package rejected`, () => { const b = Buffer.from(buf); b[b.length >> 1] ^= 0xff; assert(!verify(e, b)); });
  ok(`${e.id}: no path traversal in package`, () => { for (const en of new AdmZip(buf).getEntries()) assert(!/(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-zA-Z]:/.test(en.entryName), en.entryName); });
}
const { validateManifest, cmp, satisfies } = require('../src/main/services/extensions.js');
ok('semver compare', () => { assert(cmp('1.2.0', '1.10.0') < 0); assert(cmp('2.0.0', '2.0.0') === 0); });
ok('manifest validation rejects junk', () => { assert.throws(() => validateManifest({})); assert.throws(() => validateManifest({ id: '../x', name: 'a', version: '1.0.0' })); });
for (const f of ['src/main/main.js']) ok(f + ' parses', () => new (require('vm').Script)(`(function(){${fs.readFileSync(path.join(root, f), 'utf8').replace(/^#!.*/, '')}\n})`));
console.log(`${n} checks passed`); if (process.exitCode) console.error('SELFTEST FAILED');
