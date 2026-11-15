'use strict';
const fs = require('fs');
const path = require('path');
const { dirs } = require('../core/paths');
const registry = require('../core/registry');
const win32 = require('../core/win32');
const plat = require('../core/platform');
const { defs, CUR, ACC, DESK } = require('./appearance-defs');
const log = require('../core/logger').make('os-settings');

const baselineFile = () => path.join(dirs.backups, 'baseline.json');
let baseline = null;             // { regs: {"key|name": raw|null}, spi: {id: value} }  – the user's ORIGINAL Windows values
function loadBaseline() {
  if (baseline) return baseline;
  try { baseline = JSON.parse(fs.readFileSync(baselineFile(), 'utf8')); } catch { baseline = { regs: {}, spi: {} }; }
  return baseline;
}
function saveBaseline() { try { fs.writeFileSync(baselineFile(), JSON.stringify(baseline, null, 2)); } catch (e) { log.warn('baseline save failed', e); } }

const flags = { explorerRefresh: false };
const rk = (key, name) => `${key}|${name}`;

// Remember the original value the first time we touch a registry value, so everything stays reversible.
async function ensureBaseline(key, name) {
  const b = loadBaseline();
  const id = rk(key, name);
  if (id in b.regs) return;
  const cur = await registry.get(key, name);
  b.regs[id] = cur ? { type: cur.type, data: cur.data } : null;
  saveBaseline();
}
async function regWrite(key, name, type, data) {
  await ensureBaseline(key, name);
  const r = await registry.set(key, name, type, data);
  if (!r.ok) log.warn(`registry write failed ${key}\\${name}: ${r.error}`);
  return r;
}
async function regRaw(key, name) { const v = await registry.get(key, name); return v ? { type: v.type, data: v.data } : null; }

const FIT = { fill: ['10', '0'], fit: ['6', '0'], stretch: ['2', '0'], tile: ['0', '1'], center: ['0', '0'], span: ['22', '0'] };
function readFit(style, tile) {
  if (tile === '1') return 'tile';
  return { '10': 'fill', '6': 'fit', '2': 'stretch', '22': 'span', '0': 'center' }[String(style)] || 'fill';
}

function supported(def) {
  if (def.requires === 'win11') return plat.win11;
  if (def.requires === 'win10') return plat.win10;
  return true;
}

async function read(def) {
  const s = def.src;
  try {
    if (s.kind === 'reg') {
      const v = await registry.get(s.key, s.name);
      if (def.type === 'toggle') return v == null ? def.default : v.data === s.on ? true : v.data === s.off ? false : def.default;
      return v == null ? def.default : v.data;
    }
    if (s.kind === 'spi') {
      if (!win32.available) return def.default;
      if (def.type === 'toggle') { const n = win32.spiGetInt(s.get); return n == null ? def.default : n !== 0; }
      const n = win32.spiGetInt(s.get); return n == null ? def.default : n;
    }
    if (s.kind === 'minAnimate') { const v = win32.available ? win32.spiGetMinAnimate() : null; return v == null ? def.default : v; }
    if (s.kind === 'wallpaper') return win32.available ? win32.spiGetWallpaper() : '';
    if (s.kind === 'wallpaperFit') {
      const st = await registry.get(DESK, 'WallpaperStyle'); const ti = await registry.get(DESK, 'TileWallpaper');
      return readFit(st?.data, ti?.data);
    }
    if (s.kind === 'cursorSize') { const v = await registry.get(ACC, 'CursorSize'); return v ? v.data : def.default; }
  } catch (e) { log.warn(`read ${def.id} failed`, e); }
  return def.default;
}

// returns { ok, error?, post? }
async function write(def, value) {
  const s = def.src;
  if (!supported(def)) return { ok: false, error: 'Не поддерживается в вашей версии Windows' };
  const b = loadBaseline();
  try {
    if (s.kind === 'reg') {
      if (def.post === 'desktopIcons') return desktopIcons(def, value);
      const data = def.type === 'toggle' ? (value ? s.on : s.off) : Number(value);
      return { ...(await regWrite(s.key, s.name, s.type, data)), post: def.post };
    }
    if (s.kind === 'spi') {
      if (!win32.available) return { ok: false, error: 'Windows API недоступен' };
      if (!(def.id in b.spi)) { b.spi[def.id] = await read(def); saveBaseline(); }
      let ok;
      if (s.mode === 'bool') ok = win32.spiSetBool(s.set, !!value);
      else if (s.mode === 'uiParam') ok = win32.spiSetUiParam(s.set, Number(value));
      else ok = win32.spiSetPvInt(s.set, Number(value));
      return { ok };
    }
    if (s.kind === 'minAnimate') {
      if (!win32.available) return { ok: false, error: 'Windows API недоступен' };
      if (!(def.id in b.spi)) { b.spi[def.id] = await read(def); saveBaseline(); }
      return { ok: win32.spiSetMinAnimate(!!value) };
    }
    if (s.kind === 'wallpaper') {
      if (!value) return { ok: true };
      if (!(def.id in b.spi)) { b.spi[def.id] = await read(def); saveBaseline(); }
      return { ok: win32.available ? win32.spiSetWallpaper(String(value)) : false };
    }
    if (s.kind === 'wallpaperFit') {
      const [style, tile] = FIT[value] || FIT.fill;
      await regWrite(DESK, 'WallpaperStyle', 'REG_SZ', style);
      await regWrite(DESK, 'TileWallpaper', 'REG_SZ', tile);
      if (win32.available) { const cur = win32.spiGetWallpaper(); if (cur) win32.spiSetWallpaper(cur); }
      return { ok: true };
    }
    if (s.kind === 'cursorSize') {
      const n = Math.max(1, Math.min(15, Number(value)));
      await regWrite(ACC, 'CursorSize', 'REG_DWORD', n);
      await regWrite(CUR, 'CursorBaseSize', 'REG_DWORD', 32 + (n - 1) * 16);
      if (win32.available) win32.reloadCursors();
      return { ok: true, post: 'relogin' };
    }
  } catch (e) { log.error(`write ${def.id} failed`, e); return { ok: false, error: e.message }; }
  return { ok: false, error: 'unknown source' };
}

async function desktopIcons(def, hide) {
  const cur = await registry.get(def.src.key, def.src.name);
  const hidden = cur ? cur.data === 1 : false;
  await ensureBaseline(def.src.key, def.src.name);
  if (hidden !== !!hide) {
    if (win32.available && win32.toggleDesktopIcons()) return { ok: true };
    return { ok: (await registry.set(def.src.key, def.src.name, 'REG_DWORD', hide ? 1 : 0)).ok, post: 'explorer' };
  }
  return { ok: true };
}

function broadcastPost(posts) {
  if (!win32.available) return;
  if (posts.has('theme')) win32.broadcastSetting('ImmersiveColorSet');
  if (posts.has('tray')) win32.broadcastSetting('TraySettings');
  if (posts.has('explorer')) { win32.broadcastSetting('ShellState'); flags.explorerRefresh = true; }
}

const byId = new Map(defs.map((d) => [d.id, d]));

async function readAll() {
  const out = {};
  for (const d of defs) out[d.id] = await read(d);
  return out;
}
// apply { id: value } – only values that differ from the current ones are written
async function applyMany(values, { force = false } = {}) {
  const posts = new Set(); const errors = []; let changed = 0;
  for (const [id, v] of Object.entries(values)) {
    const d = byId.get(id); if (!d || !supported(d)) continue;
    if (!force) { const cur = await read(d); if (cur === v) continue; }
    const r = await write(d, v);
    if (r.ok) { changed++; if (r.post) posts.add(r.post); } else errors.push({ id, error: r.error });
  }
  broadcastPost(posts);
  return { changed, errors, needsExplorerRestart: posts.has('explorer') && flags.explorerRefresh, needsRelogin: posts.has('relogin') };
}

// ── baseline / snapshot restore ──
async function restoreBaseline() {
  const b = loadBaseline(); const errors = [];
  for (const [id, raw] of Object.entries(b.regs)) {
    const [key, name] = id.split('|');
    const r = raw ? await registry.set(key, name, raw.type, raw.data) : await registry.del(key, name);
    if (!r.ok) errors.push({ id, error: r.error });
  }
  for (const [id, v] of Object.entries(b.spi)) {
    if (id === 'tb.autoHide') { if (win32.available) win32.setAutoHide(!!v); continue; }
    const d = byId.get(id); if (!d) continue;
    await write(d, v);
  }
  broadcastPost(new Set(['theme', 'tray', 'explorer']));
  return { errors };
}
async function captureRaw() {
  const b = loadBaseline(); const regs = {};
  for (const id of Object.keys(b.regs)) { const [key, name] = id.split('|'); regs[id] = await regRaw(key, name); }
  const spi = {};
  for (const id of Object.keys(b.spi)) { const d = byId.get(id); if (d) spi[id] = await read(d); }
  return { regs, spi };
}
async function restoreRaw(snap) {
  for (const [id, raw] of Object.entries(snap.regs || {})) {
    const [key, name] = id.split('|');
    if (raw) await registry.set(key, name, raw.type, raw.data); else await registry.del(key, name);
  }
  for (const [id, v] of Object.entries(snap.spi || {})) { const d = byId.get(id); if (d) await write(d, v); }
  broadcastPost(new Set(['theme', 'tray', 'explorer']));
}

// reset individual definitions to the user's ORIGINAL Windows values (the baseline captured before our first change)
async function resetIds(ids) {
  const b = loadBaseline(); const posts = new Set(); let n = 0;
  for (const id of ids) {
    const d = byId.get(id); if (!d) continue;
    const s = d.src;
    if (s.kind === 'reg') {
      const raw = b.regs[rk(s.key, s.name)];
      if (rk(s.key, s.name) in b.regs) { raw ? await registry.set(s.key, s.name, raw.type, raw.data) : await registry.del(s.key, s.name); n++; if (d.post) posts.add(d.post); }
    } else if (id in b.spi) { await write(d, b.spi[id]); n++; }
  }
  broadcastPost(posts);
  return { reset: n };
}
function describe() {
  return defs.map(({ src, ...d }) => ({ ...d, supported: supported(d) }));
}
function getBaseline() { return loadBaseline(); }
module.exports = { resetIds, getBaseline, saveBaselineNow: saveBaseline, defs, describe, read, readAll, applyMany, regWrite, regRaw, restoreBaseline, captureRaw, restoreRaw, supported, flags, byId, ensureBaseline };
