'use strict';
const fs = require('fs');
const path = require('path');
const { dirs } = require('./paths');

const ring = [];
const listeners = new Set();
let current = null;

function file(name) {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(dirs.logs, `${name}-${d}.log`);
}
function write(name, level, scope, msg) {
  const line = `${new Date().toISOString()} [${level}] ${scope}: ${msg}\n`;
  try { fs.appendFileSync(file(name), line); } catch { /* disk problems must never crash the app */ }
  return line;
}
function fmt(a) {
  return a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
}
function make(scope) {
  const emit = (level) => (...a) => {
    const msg = fmt(a);
    write('hub', level, scope, msg);
    const entry = { t: Date.now(), level, scope, msg };
    ring.push(entry); if (ring.length > 500) ring.shift();
    for (const l of listeners) { try { l(entry); } catch {} }
  };
  return { info: emit('INFO'), warn: emit('WARN'), error: emit('ERROR'), debug: emit('DEBUG') };
}
// Per-extension log (extensions can only write to their own file)
function extLogger(id) {
  const safe = id.replace(/[^a-z0-9._-]/gi, '_');
  return (level, ...a) => {
    const msg = fmt(a).slice(0, 2000);
    write(`ext-${safe}`, level.toUpperCase(), id, msg);
    const entry = { t: Date.now(), level: level.toUpperCase(), scope: `ext:${id}`, msg };
    ring.push(entry); if (ring.length > 500) ring.shift();
    for (const l of listeners) { try { l(entry); } catch {} }
  };
}
function prune(days = 14) {
  try {
    const limit = Date.now() - days * 864e5;
    for (const f of fs.readdirSync(dirs.logs)) {
      const p = path.join(dirs.logs, f);
      if (fs.statSync(p).mtimeMs < limit) fs.unlinkSync(p);
    }
  } catch {}
}
module.exports = { make, extLogger, prune, recent: (n = 100) => ring.slice(-n), onEntry: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
