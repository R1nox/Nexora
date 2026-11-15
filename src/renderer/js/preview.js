// Live taskbar preview – a faithful CSS simulation of what Apply will do (used by the Taskbar and Profiles pages).
import { h } from './ui.js';

const WALLS = {
  aurora: 'radial-gradient(circle at 20% 30%,#7c3aed 0,transparent 45%),radial-gradient(circle at 80% 70%,#06b6d4 0,transparent 50%),linear-gradient(135deg,#1e1b4b,#0f172a)',
  sunset: 'radial-gradient(circle at 70% 20%,#fb923c 0,transparent 40%),radial-gradient(circle at 20% 80%,#ec4899 0,transparent 55%),linear-gradient(160deg,#312e81,#7c2d12)',
  light: 'radial-gradient(circle at 30% 20%,#fde68a 0,transparent 45%),linear-gradient(135deg,#bae6fd,#e9d5ff)',
  forest: 'radial-gradient(circle at 60% 30%,#34d399 0,transparent 45%),linear-gradient(135deg,#064e3b,#022c22)',
};
export const wallpapers = Object.keys(WALLS);
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const ICON_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee'];

// cfg = taskbar config, wall = wallpaper key, width = CSS px of the mock desk (used for scale)
export function renderPreview(cfg, { wall = 'aurora', width = 560, win11 = true } = {}) {
  const s = width / 1920; // 1 real px == s preview px
  const desk = h('div', { class: 'desk' },
    h('div', { class: 'wall', style: { background: WALLS[wall] || WALLS.aurora } }),
    h('div', { class: 'fakewin' }, h('i'), h('i', { style: { width: '60%' } }), h('i', { style: { width: '75%' } })),
    h('div', { class: 'fakewin fakewin2' }, h('i'), h('i', { style: { width: '50%' } })));
  desk.style.setProperty('--s', s);
  update(desk, cfg, win11);
  return desk;
}
export function update(desk, cfg, win11 = true) {
  desk.querySelectorAll('.tbm').forEach((n) => n.remove());
  const s = parseFloat(desk.style.getPropertyValue('--s')) || 0.3;
  const pos = win11 ? (cfg.position === 'top' ? 'top' : 'bottom') : cfg.position;
  const horiz = pos === 'bottom' || pos === 'top';
  const f = cfg.floating.enabled ? cfg.floating : { marginX: 0, insetTop: 0, insetBottom: 0, radius: 0 };
  const bar = h('div', { class: `tbm ${pos}` });
  // ── material ──
  const layer = h('div', { class: 'layer' });
  const tint = rgba(cfg.color, Math.max(0.02, cfg.opacity / 100));
  if (!cfg.enabled || cfg.mode === 'normal') { layer.style.background = 'rgba(28,28,32,.88)'; layer.style.backdropFilter = 'blur(20px)'; }
  else if (cfg.mode === 'clear') layer.style.background = 'rgba(0,0,0,.01)';
  else if (cfg.mode === 'opaque') layer.style.background = tint;
  else if (cfg.mode === 'blur') { layer.style.background = tint; layer.style.backdropFilter = 'blur(' + 14 * s * 3 + 'px)'; }
  else if (cfg.mode === 'glass') { layer.style.background = `linear-gradient(180deg,rgba(255,255,255,.18),${tint})`; layer.style.backdropFilter = 'blur(' + 18 * s * 3 + 'px) saturate(160%)'; layer.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.35)'; }
  else if (cfg.mode === 'acrylic') { layer.style.background = tint; layer.style.backdropFilter = 'blur(' + 30 * s * 3 + 'px) saturate(170%)'; layer.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,.08)'; }
  if (cfg.enabled && cfg.overlay.enabled) {
    const o = cfg.overlay;
    if (o.gradient.enabled) layer.append(h('div', { class: 'ov-grad', style: { background: `linear-gradient(${o.gradient.angle}deg,${o.gradient.from},${o.gradient.to})`, opacity: o.gradient.opacity / 100 } }));
    if (o.glow.enabled) { const k = o.glow.intensity / 100; const side = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' }[pos]; layer.append(h('div', { class: 'ov-glow', style: { boxShadow: `inset 0 0 ${(6 + 14 * k) * s * 3}px ${rgba(o.glow.color, 0.15 + 0.5 * k)}`, ['border' + side[0].toUpperCase() + side.slice(1)]: `${Math.max(1, 1.5 * s * 2)}px solid ${rgba(o.glow.color, 0.4 + 0.6 * k)}` } })); }
  }
  bar.append(layer);
  // ── geometry (floating) ──
  const em = cfg.enabled ? f : { marginX: 0, insetTop: 0, insetBottom: 0, radius: 0 };
  const r = em.radius * s;
  if (horiz) {
    bar.style.left = em.marginX * s + 'px'; bar.style.right = em.marginX * s + 'px';
    bar.style[pos] = em.insetBottom * s * (pos === 'bottom' ? 1 : 0) + em.insetTop * s * (pos === 'top' ? 1 : 0) + 'px';
  } else { bar.style.top = em.marginX * s + 'px'; bar.style.bottom = em.marginX * s + 'px'; }
  if (win11 && cfg.enabled && cfg.size && horiz) {
    const z = cfg.size;
    if (z.height > 0) bar.style.height = z.height * s + 'px';
    if (z.widthPct < 100) { const w = z.widthPct / 100; const free = (1 - w) * 100; const l = z.align === 'left' ? 0 : z.align === 'right' ? free : free / 2; bar.style.left = `calc(${l}% + ${em.marginX * s}px)`; bar.style.right = `calc(${free - l}% + ${em.marginX * s}px)`; }
  }
  bar.style.borderRadius = r + 'px'; layer.style.borderRadius = r + 'px';
  if (cfg.enabled && cfg.overlay.enabled && cfg.overlay.shadow.enabled) bar.style.boxShadow = `0 0 ${cfg.overlay.shadow.blur * s * 2}px rgba(0,0,0,${cfg.overlay.shadow.opacity / 100})`; else bar.style.boxShadow = 'none';
  // ── contents ──
  const size = cfg.iconSize === 'small' ? 22 : cfg.iconSize === 'large' ? 34 : 28;
  bar.style.setProperty('--isz', size);
  const start = h('div', { class: 'start' }, h('i'), h('i'), h('i'), h('i'));
  const icons = ICON_COLORS.slice(0, 6).map((c, i) => h('div', { class: 'ic', style: { background: `linear-gradient(135deg,${c},${ICON_COLORS[(i + 2) % 7]})` } }));
  const tray = h('div', { class: 'tray' }, horiz ? ['ENG', '14:32'].map((t) => h('span', {}, t)) : []);
  const center = win11 ? cfg.centerIcons : false;
  if (horiz) {
    if (center) bar.append(h('div', { class: 'grow' }), start, ...icons, h('div', { class: 'grow' }), tray);
    else bar.append(start, ...icons, h('div', { class: 'grow' }), tray);
  } else bar.append(start, ...icons);
  desk.append(bar);
  return desk;
}
