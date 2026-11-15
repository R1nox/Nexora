'use strict';
const fs = require('fs');
const path = require('path');

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
// merge defaults into data (keeps user values, adds new keys introduced by an update)
function withDefaults(data, defaults) {
  const out = Array.isArray(defaults) ? (Array.isArray(data) ? data : defaults) : {};
  if (Array.isArray(defaults)) return out;
  for (const k of Object.keys(defaults)) {
    if (isObj(defaults[k])) out[k] = withDefaults(isObj(data?.[k]) ? data[k] : {}, defaults[k]);
    else out[k] = data && k in data ? data[k] : defaults[k];
  }
  if (isObj(data)) for (const k of Object.keys(data)) if (!(k in out)) out[k] = data[k];
  return out;
}

class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file; this.defaults = defaults; this.timer = null;
    this.data = this._load();
  }
  _readFile(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  _load() {
    let raw = null;
    for (const f of [this.file, this.file + '.bak']) {
      try { raw = this._readFile(f); break; } catch { /* try backup next */ }
    }
    return withDefaults(raw || {}, this.defaults);
  }
  get(p, fallback) {
    let cur = this.data;
    if (!p) return cur;
    for (const k of p.split('.')) { if (cur == null) return fallback; cur = cur[k]; }
    return cur === undefined ? fallback : cur;
  }
  set(p, value) {
    const keys = p.split('.'); let cur = this.data;
    for (let i = 0; i < keys.length - 1; i++) { if (!isObj(cur[keys[i]])) cur[keys[i]] = {}; cur = cur[keys[i]]; }
    cur[keys[keys.length - 1]] = value;
    this.save();
  }
  replace(data) { this.data = withDefaults(data, this.defaults); this.save(); }
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 150); }
  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      if (fs.existsSync(this.file)) { try { fs.copyFileSync(this.file, this.file + '.bak'); } catch {} }
      fs.renameSync(tmp, this.file); // atomic replace: no half-written config after a crash
    } catch (e) { console.error('store flush failed', e); }
  }
}
module.exports = { JsonStore, withDefaults, isObj };
