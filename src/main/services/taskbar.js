'use strict';
const { screen } = require('electron');
const win32 = require('../core/win32');
const plat = require('../core/platform');
const registry = require('../core/registry');
const osSettings = require('./os-settings');
const { taskbarRegistry: R } = require('./appearance-defs');
const overlay = require('./overlay');
const system = require('./system');
const log = require('../core/logger').make('taskbar');

const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// translate a style {mode,color,opacity} to a WCA accent policy
function accentFor(style) {
  const [r, g, b] = hex(style.color || '#000000');
  const alpha = Math.max(0, Math.min(255, Math.round((style.opacity ?? 60) * 2.55)));
  const abgr = (a, rr, gg, bb) => (((a & 255) << 24) | ((bb & 255) << 16) | ((gg & 255) << 8) | (rr & 255)) >>> 0;
  switch (style.mode) {
    case 'clear': return { state: 2, abgr: abgr(1, 0, 0, 0) };
    case 'blur': return { state: 3, abgr: abgr(alpha, r, g, b) };
    case 'glass': return { state: 3, abgr: abgr(alpha, lerp(r, 255, 0.22), lerp(g, 255, 0.22), lerp(b, 255, 0.22)) };
    case 'acrylic': return { state: 4, abgr: abgr(Math.max(alpha, 1), r, g, b) };
    case 'opaque': return { state: 2, abgr: abgr(alpha, r, g, b) };
    default: return { state: 0, abgr: 0 };
  }
}

class TaskbarService {
  constructor({ store, getDynamic, snapshot, emit }) {
    this.store = store; this.getDynamic = getDynamic || (() => null); this.snapshot = snapshot; this.emit = emit || (() => {});
    this.timer = null; this.touched = false; this.last = { key: '', t: 0 };
    this.regionKey = ''; this.regionT = 0; this.cur = null; this.dynState = 'normal'; this.handle = null;
    this.edgeCache = 'bottom'; this.geo = null; this.geoKey = '';
  }
  get cfg() { return this.store.get('taskbar'); }

  start() { this.reschedule(); }
  reschedule() {
    clearInterval(this.timer); this.timer = null;
    if (!win32.available) return;
    const dyn = this.getDynamic();
    if (!this.cfg.enabled && !this.touched) return;
    this.timer = setInterval(() => this.tick(), dyn ? 100 : this.geometryWanted() ? 300 : 1000);
    this.tick();
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  // ── geometry (Windows 11): custom height / width / top edge by repositioning Shell_TrayWnd ──
  geometryWanted() {
    const c = this.cfg; if (!c.enabled || !plat.win11) return false;
    const z = c.size || {}; return c.position === 'top' || z.height > 0 || z.widthPct < 100 || (c.floating.enabled && c.floating.marginX > 0);
  }
  applyGeometry(bars) {
    const c = this.cfg; const b = bars.find((x) => x.primary); if (!b) return;
    if (!this.geometryWanted() || c.autoHide) { this.restoreGeometry(); return; }
    const rect = win32.rect(b.hwnd); if (!rect) return;
    const d = screen.getPrimaryDisplay(); const s = d.scaleFactor || 1;
    const sw = Math.round(d.bounds.width * s), sh = Math.round(d.bounds.height * s);
    if (!this.geo) this.geo = { rect: { ...rect }, work: win32.getWorkArea() };
    const z = c.size;
    const origH = this.geo.rect.bottom - this.geo.rect.top;
    const hh = z.height > 0 ? Math.round(z.height * s) : origH;
    const side = c.floating.enabled ? Math.round(c.floating.marginX * s) : 0; // side margins narrow the real window, so the tray moves inward instead of being clipped
    const ww = Math.max(Math.round(sw * 0.2), Math.round(sw * z.widthPct / 100) - 2 * side);
    const x = z.align === 'left' ? side : z.align === 'right' ? sw - ww - side : Math.round((sw - ww) / 2);
    const y = c.position === 'top' ? 0 : sh - hh;
    if (Math.abs(rect.left - x) > 1 || Math.abs(rect.top - y) > 1 || Math.abs(rect.right - rect.left - ww) > 1 || Math.abs(rect.bottom - rect.top - hh) > 1) win32.setPos(b.hwnd, x, y, ww, hh);
    const work = c.position === 'top' ? { left: 0, top: hh, right: sw, bottom: sh } : { left: 0, top: 0, right: sw, bottom: sh - hh };
    const key = JSON.stringify(work);
    if (key !== this.geoKey) { win32.setWorkArea(work); this.geoKey = key; }
  }
  restoreGeometry() {
    if (!this.geo) return;
    try {
      const b = win32.getTaskbars().find((x) => x.primary); const g = this.geo; this.geo = null; this.geoKey = '';
      if (b) win32.setPos(b.hwnd, g.rect.left, g.rect.top, g.rect.right - g.rect.left, g.rect.bottom - g.rect.top);
      if (g.work) win32.setWorkArea(g.work);
    } catch (e) { log.warn('restoreGeometry failed', e); }
  }

  styleNow() {
    const c = this.cfg; const dyn = this.getDynamic();
    let target = { mode: c.mode, color: c.color, opacity: c.opacity };
    this.dynState = 'normal';
    if (dyn && win32.available) {
      const fg = win32.foreground();
      if (fg && fg.zoomed && !fg.iconic && fg.visible && !['Progman', 'WorkerW', 'Shell_TrayWnd'].includes(fg.cls)) this.dynState = 'maximized';
      else if (fg && fg.cls === 'Windows.UI.Core.CoreWindow') this.dynState = 'start';
      if (this.dynState === 'maximized' && dyn.maximized !== false) target = { mode: dyn.maximizedMode, color: dyn.maximizedColor, opacity: dyn.maximizedOpacity };
      if (this.dynState === 'start' && dyn.start !== false) target = { mode: dyn.startMode, color: dyn.startColor, opacity: dyn.startOpacity };
      if (dyn.animate && this.cur && this.cur.mode === target.mode) {
        // smooth transition between two states of the same material
        const a = hex(this.cur.color), b = hex(target.color);
        const k = 0.35;
        const next = { mode: target.mode, color: '#' + [0, 1, 2].map((i) => lerp(a[i], b[i], k).toString(16).padStart(2, '0')).join(''), opacity: lerp(this.cur.opacity, target.opacity, k) };
        if (Math.abs(next.opacity - target.opacity) < 2) next.opacity = target.opacity;
        this.cur = next; return next;
      }
    }
    this.cur = target; return target;
  }

  tick() {
    try {
      if (!win32.available) return;
      const c = this.cfg;
      const bars = win32.getTaskbars();
      if (!c.enabled) { if (this.touched) this.clearEffects(); return; }
      const style = this.styleNow();
      const ac = accentFor(style);
      const now = Date.now();
      const handle = bars.length ? win32.addr(bars[0].hwnd) : null;
      const key = JSON.stringify([ac, bars.length, String(handle)]);
      if (key !== this.last.key || now - this.last.t > 1000) {
        for (const b of bars) win32.setAccent(b.hwnd, ac.state, ac.abgr);
        this.last = { key, t: now };
      }
      this.touched = true;
      this.applyGeometry(bars);
      this.applyRegion(bars, c, now);
      if (bars[0]) {
        const rect = win32.rect(bars[0].hwnd);
        const vis = win32.isVisible(bars[0].hwnd);
        const edge = this.detectEdge(rect);
        const onscreen = rect && vis && rect.right > rect.left;
        overlay.update(c, onscreen && !this.offscreen(rect) ? rect : null, edge);
      }
    } catch (e) { log.error('tick failed', e); }
  }
  offscreen(rect) {
    try {
      const d = screen.getPrimaryDisplay();
      const b = d.bounds, s = d.scaleFactor;
      const bw = b.width * s, bh = b.height * s;
      return rect.right <= 0 || rect.bottom <= 0 || rect.left >= bw + b.x * s || rect.top >= bh + b.y * s;
    } catch { return false; }
  }
  detectEdge(rect) {
    if (!rect) return this.edgeCache;
    const w = rect.right - rect.left, h = rect.bottom - rect.top;
    const d = screen.getPrimaryDisplay(); const s = d.scaleFactor;
    let e;
    if (w >= h) e = rect.top < (d.bounds.height * s) / 2 ? 'top' : 'bottom'; else e = rect.left < (d.bounds.width * s) / 2 ? 'left' : 'right';
    this.edgeCache = e; return e;
  }
  scaleOf(rect) {
    try { const p = screen.screenToDipPoint({ x: rect.left + 2, y: rect.top + 2 }); return screen.getDisplayNearestPoint(p).scaleFactor || 1; } catch { return 1; }
  }
  applyRegion(bars, c, now) {
    const f = c.floating;
    for (const [i, b] of bars.entries()) {
      const rect = win32.rect(b.hwnd); if (!rect) continue;
      const w = rect.right - rect.left, h = rect.bottom - rect.top;
      const key = JSON.stringify([w, h, f, i, String(win32.addr(b.hwnd))]);
      if (f.enabled) {
        if (key === this.regionKey && now - this.regionT < 3000 && i === 0) continue;
        const s = this.scaleOf(rect);
        const horiz = w >= h;
        let l = 0, t = 0, r = w, bt = h;
        if (horiz) { l = plat.win11 ? 0 : Math.round(f.marginX * s); r = w - l; t = Math.round(f.insetTop * s); bt = h - Math.round(f.insetBottom * s); }
        else { t = Math.round(f.marginX * s); bt = h - t; l = Math.round(f.insetTop * s); r = w - Math.round(f.insetBottom * s); }
        if (r - l < 80 || bt - t < 20) { win32.clearRegion(b.hwnd); continue; } // never produce an unusable taskbar
        win32.setRoundRegion(b.hwnd, l, t, r, bt, Math.round(f.radius * s));
        if (i === 0) { this.regionKey = key; this.regionT = now; }
      } else if (this.regionKey !== '') {
        win32.clearRegion(b.hwnd);
        if (i === bars.length - 1) this.regionKey = '';
      }
    }
  }
  clearEffects() {
    this.restoreGeometry();
    try {
      for (const b of win32.getTaskbars()) { win32.setAccent(b.hwnd, 0, 0); win32.clearRegion(b.hwnd); }
    } catch (e) { log.warn('clearEffects failed', e); }
    overlay.hide();
    this.touched = false; this.regionKey = ''; this.last = { key: '', t: 0 }; this.cur = null;
  }

  // ── registry-backed OS taskbar values ──
  async readOs() {
    const g = async (k) => (await registry.get(k.key, k.name))?.data;
    const out = {
      centerIcons: (await g(R.centerIcons)) !== 0,
      taskView: (await g(R.taskView)) === 0,   // true = hidden
      widgets: (await g(R.widgets)) === 0,
      chat: (await g(R.chat)) === 0,
    };
    const sm = await g(R.search);
    out.search = sm === 0 ? 'hidden' : sm === 1 ? 'icon' : sm === 2 ? 'box' : 'default';
    const si = await g(R.iconSize11); const sm10 = await g(R.iconSize10);
    out.iconSize = plat.win11 ? (si === 0 ? 'small' : si === 2 ? 'large' : 'default') : (sm10 === 1 ? 'small' : 'default');
    out.autoHide = win32.available ? win32.getAutoHide() : false;
    out.position = plat.win10 ? await this.readPosition() : (this.cfg.position === 'top' ? 'top' : 'bottom');
    return out;
  }
  async readPosition() {
    const v = await registry.get(R.stuckRects.key, R.stuckRects.name);
    if (!v || typeof v.data !== 'string' || v.data.length < 26) return 'bottom';
    return ['left', 'top', 'right', 'bottom'][parseInt(v.data.substr(24, 2), 16)] || 'bottom';
  }
  async writePosition(pos) {
    const v = await registry.get(R.stuckRects.key, R.stuckRects.name);
    if (!v || typeof v.data !== 'string' || v.data.length < 26) return { ok: false, error: 'StuckRects3 не найден' };
    await osSettings.ensureBaseline(R.stuckRects.key, R.stuckRects.name);
    const code = { left: 0, top: 1, right: 2, bottom: 3 }[pos]; if (code == null) return { ok: false, error: 'bad position' };
    const data = v.data.slice(0, 24) + code.toString(16).padStart(2, '0') + v.data.slice(26);
    return registry.set(R.stuckRects.key, R.stuckRects.name, 'REG_BINARY', data);
  }

  // Apply a whole taskbar configuration. Returns { ok, errors[], needsExplorerRestart }
  async apply(next, { reason = 'apply' } = {}) {
    const prev = this.cfg; const errors = []; let needsExplorerRestart = false;
    if (this.snapshot) await this.snapshot(`Перед изменением панели задач (${reason})`);
    const w = async (k, v) => { const r = await osSettings.regWrite(k.key, k.name, k.type, v); if (!r.ok) errors.push({ id: k.name, error: r.error }); return r; };
    const cur = await this.readOs();
    if (plat.win11 && cur.centerIcons !== next.centerIcons) await w(R.centerIcons, next.centerIcons ? 1 : 0);
    if (cur.taskView !== next.hide.taskView) await w(R.taskView, next.hide.taskView ? 0 : 1);
    if (plat.win11) {
      if (cur.widgets !== next.hide.widgets) await w(R.widgets, next.hide.widgets ? 0 : 1);
      if (cur.chat !== next.hide.chat) await w(R.chat, next.hide.chat ? 0 : 1);
    }
    if (next.hide.search !== 'default' && next.hide.search !== cur.search) await w(R.search, { hidden: 0, icon: 1, box: 2 }[next.hide.search]);
    if (next.iconSize !== cur.iconSize) {
      if (plat.win11) await w(R.iconSize11, next.iconSize === 'small' ? 0 : next.iconSize === 'large' ? 2 : 1);
      else await w(R.iconSize10, next.iconSize === 'small' ? 1 : 0);
      needsExplorerRestart = true;
    }
    if (win32.available && cur.autoHide !== next.autoHide) {
      const b = osSettings_baseline();
      if (!('tb.autoHide' in b.spi)) { b.spi['tb.autoHide'] = cur.autoHide; osSettings.saveBaselineNow?.(); }
      win32.setAutoHide(next.autoHide);
    }
    if (plat.win10 && next.position !== cur.position) {
      const r = await this.writePosition(next.position);
      if (!r.ok) errors.push({ id: 'position', error: r.error }); else needsExplorerRestart = true;
    }
    if (win32.available) win32.broadcastSetting('TraySettings');
    this.store.set('taskbar', next);
    this.touched = this.touched || next.enabled;
    this.regionKey = ''; this.last = { key: '', t: 0 };
    if (!this.geometryWanted()) this.restoreGeometry();
    this.reschedule();
    this.emit();
    log.info('taskbar applied', { reason, errors: errors.length, needsExplorerRestart });
    return { ok: errors.length === 0, errors, needsExplorerRestart };
  }

  async restoreDefaults() {
    this.clearEffects();
    const r = await osSettings.restoreBaseline();
    const { taskbarDefaults } = require('../core/defaults');
    this.store.set('taskbar', taskbarDefaults());
    this.reschedule(); this.emit();
    return r;
  }
  status() {
    return { available: win32.available, error: win32.error, active: this.touched && this.cfg.enabled, dynamicState: this.dynState, win11: plat.win11 };
  }
}
function osSettings_baseline() { return osSettings.getBaseline(); }
module.exports = { TaskbarService, accentFor };
