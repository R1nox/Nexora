'use strict';
const fs = require('fs');
const path = require('path');
const { dirs } = require('../core/paths');
const { taskbarDefaults } = require('../core/defaults');
const osSettings = require('./os-settings');
const log = require('../core/logger').make('config');

const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const color = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

// Everything that comes from a file (profile import, backups, updates) is validated and clamped.
function sanitizeTaskbar(raw) {
  const d = taskbarDefaults(); const r = raw && typeof raw === 'object' ? raw : {};
  const f = r.floating || {}, h = r.hide || {}, o = r.overlay || {}, g = o.gradient || {}, gl = o.glow || {}, sh = o.shadow || {};
  return {
    enabled: bool(r.enabled, d.enabled),
    mode: oneOf(r.mode, ['normal', 'clear', 'blur', 'glass', 'acrylic', 'opaque'], d.mode),
    color: color(r.color, d.color), opacity: clamp(r.opacity, 0, 100, d.opacity),
    autoHide: bool(r.autoHide, d.autoHide),
    floating: { enabled: bool(f.enabled, false), marginX: clamp(f.marginX, 0, 900, 12), insetTop: clamp(f.insetTop, 0, 12, 0), insetBottom: clamp(f.insetBottom, 0, 12, 0), radius: clamp(f.radius, 0, 32, 12) },
    size: { height: Math.round(clamp((r.size || {}).height, 0, 200, 0)), widthPct: Math.round(clamp((r.size || {}).widthPct, 30, 100, 100)), align: oneOf((r.size || {}).align, ['center', 'left', 'right'], 'center') },
    position: oneOf(r.position, ['bottom', 'top', 'left', 'right'], 'bottom'),
    iconSize: oneOf(r.iconSize, ['default', 'small', 'large'], 'default'),
    centerIcons: bool(r.centerIcons, true),
    hide: { taskView: bool(h.taskView, false), widgets: bool(h.widgets, false), chat: bool(h.chat, false), search: oneOf(h.search, ['default', 'hidden', 'icon', 'box'], 'default') },
    overlay: {
      enabled: bool(o.enabled, false),
      gradient: { enabled: bool(g.enabled, false), from: color(g.from, '#7c3aed'), to: color(g.to, '#06b6d4'), angle: clamp(g.angle, 0, 360, 90), opacity: clamp(g.opacity, 0, 100, 35) },
      glow: { enabled: bool(gl.enabled, false), color: color(gl.color, '#8b5cf6'), intensity: clamp(gl.intensity, 0, 100, 60) },
      shadow: { enabled: bool(sh.enabled, false), blur: clamp(sh.blur, 0, 80, 24), opacity: clamp(sh.opacity, 0, 100, 45) },
    },
  };
}
function sanitizeAppearance(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw)) {
    const d = osSettings.byId.get(id); if (!d) continue;
    if (d.type === 'toggle' && typeof v === 'boolean') out[id] = v;
    else if (d.type === 'slider') out[id] = clamp(v, d.min, d.max, d.default);
    else if (d.type === 'select' && d.options.some((o) => o[0] === v)) out[id] = v;
    else if (d.type === 'file' && typeof v === 'string' && v.length < 600 && /\.(jpe?g|png|bmp)$/i.test(v)) out[id] = v;
  }
  return out;
}

const builtins = () => {
  const T = (o) => sanitizeTaskbar({ enabled: true, ...o });
  return [
    { id: 'minimal', name: 'Minimal', icon: '◻', builtin: true, description: 'Сплошная тёмная панель, мелкие значки, без лишних кнопок.',
      taskbar: T({ mode: 'opaque', color: '#0f0f14', opacity: 100, iconSize: 'small', centerIcons: true, hide: { taskView: true, widgets: true, chat: true, search: 'hidden' } }),
      appearance: { 'fx.appsTheme': true, 'fx.systemTheme': true } },
    { id: 'glass', name: 'Glass', icon: '◈', builtin: true, description: 'Стеклянная парящая панель с акриловым размытием и мягкой подсветкой.',
      taskbar: T({ mode: 'acrylic', color: '#1a1530', opacity: 42, floating: { enabled: true, marginX: 14, insetTop: 2, insetBottom: 2, radius: 14 }, hide: { taskView: true, widgets: true, chat: true, search: 'icon' },
        overlay: { enabled: true, glow: { enabled: true, color: '#8b5cf6', intensity: 55 }, shadow: { enabled: true, blur: 22, opacity: 40 } } }),
      appearance: { 'fx.transparency': true, 'fx.appsTheme': true, 'fx.systemTheme': true } },
    { id: 'dark', name: 'Dark', icon: '☾', builtin: true, description: 'Глубокая тёмная тема приложений и системы, почти чёрная панель.',
      taskbar: T({ mode: 'blur', color: '#050507', opacity: 88, hide: { taskView: false, widgets: true, chat: true, search: 'icon' } }),
      appearance: { 'fx.appsTheme': true, 'fx.systemTheme': true, 'window.accentTitle': false } },
    { id: 'gaming', name: 'Gaming', icon: '◆', builtin: true, description: 'Минимум эффектов и анимаций для максимальной отзывчивости; панель скрывается.',
      taskbar: T({ mode: 'opaque', color: '#08080c', opacity: 100, autoHide: true, hide: { taskView: true, widgets: true, chat: true, search: 'hidden' } }),
      appearance: { 'fx.transparency': false, 'anim.minmax': false, 'anim.client': false, 'anim.menu': false, 'anim.tooltip': false, 'anim.fade': false, 'anim.combo': false, 'fx.appsTheme': true, 'fx.systemTheme': true },
      extensions: { enable: ['system-monitor'] } },
    { id: 'win11pro', name: 'Windows 11 Pro', icon: '▦', builtin: true, description: 'Аккуратный фирменный вид: акрил, центрированные значки, скруглённая панель.',
      taskbar: T({ mode: 'acrylic', color: '#202028', opacity: 70, centerIcons: true, floating: { enabled: true, marginX: 0, insetTop: 0, insetBottom: 0, radius: 8 }, hide: { taskView: true, widgets: false, chat: true, search: 'icon' } }),
      appearance: { 'fx.transparency': true, 'start.layout': 0 } },
  ];
};

class Config {
  constructor({ store, taskbar, extensions, emit }) { this.store = store; this.taskbar = taskbar; this.extensions = extensions; this.emit = emit || (() => {}); }

  // ── snapshots (automatic backups) ──
  async snapshot(label) {
    try {
      const id = Date.now();
      const snap = { id, t: id, label, taskbar: this.store.get('taskbar'), appearance: this.store.get('appearance'), activeProfile: this.store.get('activeProfile'), raw: await osSettings.captureRaw() };
      fs.writeFileSync(path.join(dirs.backups, `snap-${id}.json`), JSON.stringify(snap));
      const files = fs.readdirSync(dirs.backups).filter((f) => f.startsWith('snap-')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - 25))) fs.unlinkSync(path.join(dirs.backups, f));
      return id;
    } catch (e) { log.warn('snapshot failed', e); return null; }
  }
  listSnapshots() {
    try {
      return fs.readdirSync(dirs.backups).filter((f) => f.startsWith('snap-')).sort().reverse().map((f) => {
        try { const s = JSON.parse(fs.readFileSync(path.join(dirs.backups, f), 'utf8')); return { id: s.id, t: s.t, label: s.label, profile: s.activeProfile }; } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }
  async restoreSnapshot(id) {
    const f = path.join(dirs.backups, `snap-${Number(id)}.json`);
    const snap = JSON.parse(fs.readFileSync(f, 'utf8'));
    await osSettings.restoreRaw(snap.raw || {});
    this.store.set('appearance', sanitizeAppearance(snap.appearance));
    this.store.set('activeProfile', snap.activeProfile || 'custom');
    const r = await this.taskbar.apply(sanitizeTaskbar(snap.taskbar), { reason: 'restore' });
    log.info('snapshot restored', id);
    return r;
  }

  // ── profiles ──
  userFile(id) { return path.join(dirs.profiles, `${String(id).replace(/[^a-z0-9_-]/gi, '')}.json`); }
  list() {
    const out = builtins();
    try {
      for (const f of fs.readdirSync(dirs.profiles).filter((x) => x.endsWith('.json'))) {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(dirs.profiles, f), 'utf8'));
          if (p && p.id && !out.some((b) => b.id === p.id)) out.push({ ...p, builtin: false });
        } catch (e) { log.warn('bad profile file', f); }
      }
    } catch {}
    return out;
  }
  get(id) { return this.list().find((p) => p.id === id); }
  saveUser(p) {
    const clean = {
      id: p.id, name: String(p.name || 'Profile').slice(0, 40), icon: p.icon || '✦', description: String(p.description || '').slice(0, 200),
      taskbar: sanitizeTaskbar(p.taskbar), appearance: sanitizeAppearance(p.appearance),
      extensions: { enable: (p.extensions?.enable || []).filter((x) => typeof x === 'string').slice(0, 30), disable: (p.extensions?.disable || []).filter((x) => typeof x === 'string').slice(0, 30) },
    };
    fs.writeFileSync(this.userFile(clean.id), JSON.stringify(clean, null, 2));
    return clean;
  }
  createFromCurrent(name, description = '') {
    const id = 'u' + Date.now().toString(36);
    return this.saveUser({ id, name, description, taskbar: this.store.get('taskbar'), appearance: this.store.get('appearance'), extensions: { enable: this.extensions.enabledIds(), disable: [] } });
  }
  updateFromCurrent(id) {
    const p = this.get(id); if (!p || p.builtin) throw new Error('Встроенные профили нельзя перезаписывать');
    return this.saveUser({ ...p, taskbar: this.store.get('taskbar'), appearance: this.store.get('appearance'), extensions: { enable: this.extensions.enabledIds(), disable: [] } });
  }
  rename(id, name) { const p = this.get(id); if (!p || p.builtin) throw new Error('Нельзя переименовать встроенный профиль'); return this.saveUser({ ...p, name }); }
  duplicate(id) { const p = this.get(id); if (!p) throw new Error('Профиль не найден'); return this.saveUser({ ...p, id: 'u' + Date.now().toString(36), name: `${p.name} (копия)` }); }
  remove(id) {
    const p = this.get(id); if (!p || p.builtin || id === 'custom') throw new Error('Этот профиль нельзя удалить');
    fs.unlinkSync(this.userFile(id));
    if (this.store.get('activeProfile') === id) this.store.set('activeProfile', 'custom');
  }
  exportProfile(id) {
    const p = this.get(id); if (!p) throw new Error('Профиль не найден');
    const { builtin, ...rest } = p;
    return JSON.stringify({ format: 'wch-profile', version: 1, exportedAt: new Date().toISOString(), profile: rest }, null, 2);
  }
  importProfile(text) {
    let j; try { j = JSON.parse(text); } catch { throw new Error('Файл повреждён: это не JSON'); }
    if (!j || j.format !== 'wch-profile' || !j.profile) throw new Error('Это не файл профиля Windows Customization Hub');
    const p = j.profile;
    return this.saveUser({ ...p, id: 'u' + Date.now().toString(36), name: String(p.name || 'Импортированный профиль').slice(0, 36) });
  }
  async apply(id) {
    const p = this.get(id); if (!p) throw new Error('Профиль не найден');
    await this.snapshot(`Перед применением профиля «${p.name}»`);
    const tb = await this.taskbar.apply(sanitizeTaskbar(p.taskbar), { reason: `profile ${p.id}` });
    this.store.set('appearance', sanitizeAppearance(p.appearance));
    const ap = await osSettings.applyMany(sanitizeAppearance(p.appearance));
    for (const eid of p.extensions?.enable || []) { try { await this.extensions.setEnabled(eid, true); } catch (e) { log.warn(`profile: cannot enable ${eid}: ${e.message}`); } }
    for (const eid of p.extensions?.disable || []) { try { await this.extensions.setEnabled(eid, false); } catch {} }
    this.store.set('activeProfile', p.id);
    this.emit();
    return { ok: tb.ok && ap.errors.length === 0, errors: [...tb.errors, ...ap.errors], needsExplorerRestart: tb.needsExplorerRestart || ap.needsExplorerRestart, needsRelogin: ap.needsRelogin };
  }
  async restoreWindowsDefault() {
    await this.snapshot('Перед восстановлением стандартного вида Windows');
    const r = await this.taskbar.restoreDefaults();
    this.store.set('appearance', {});
    this.store.set('activeProfile', 'custom');
    this.emit();
    return r;
  }
}
module.exports = { Config, sanitizeTaskbar, sanitizeAppearance, builtins };
