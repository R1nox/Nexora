'use strict';
// Thin wrapper over reg.exe – no native modules, works without admin rights for HKCU.
// On non-Windows (development) an in-memory registry is used so the UI can be tested.
const { execFile } = require('child_process');
const { isWin } = require('./platform');

const mock = new Map();
const k = (key, name) => `${key.toLowerCase()}|${String(name).toLowerCase()}`;

function run(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) =>
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// returns { type, data } or null when the value does not exist
async function get(key, name) {
  if (!isWin) return mock.get(k(key, name)) || null;
  const r = await run(['query', key, '/v', name]);
  if (r.err) return null;
  const m = r.stdout.match(new RegExp(`^\\s+${esc(name)}\\s+(REG_[A-Z_]+)\\s*(.*)$`, 'im'));
  if (!m) return null;
  const type = m[1]; let data = (m[2] || '').trim();
  if (type === 'REG_DWORD' || type === 'REG_QWORD') data = parseInt(data, 16);
  return { type, data };
}
async function set(key, name, type, data) {
  if (!isWin) { mock.set(k(key, name), { type, data }); return { ok: true }; }
  const r = await run(['add', key, '/v', name, '/t', type, '/d', String(data), '/f']);
  return r.err ? { ok: false, error: (r.stderr || r.err.message).trim() } : { ok: true };
}
async function del(key, name) {
  if (!isWin) { mock.delete(k(key, name)); return { ok: true }; }
  const r = await run(['delete', key, '/v', name, '/f']);
  return r.err ? { ok: false, error: (r.stderr || r.err.message).trim() } : { ok: true };
}
module.exports = { get, set, del };
