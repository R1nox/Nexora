// Design-system building blocks: DOM helper, icons, controls, toasts, modals.
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  taskbar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 15h18"/><path d="M8 18h.01M12 18h.01M16 18h.01"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.3-1-.6-1.4-.3-.4-.4-.8-.4-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-7.7-9-7.7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>', upload: '<path d="M12 17V5M7 9l5-5 5 5M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>', cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', sparkles: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>', window: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>', desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  film: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>', start: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  ram: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 11v2M11 11v2M15 11v2M19 11v2M6 17v3M18 17v3"/>', activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>', tool: '<path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5l-3 3-3-1-1-3z"/>', hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', `i ${cls}`);
  s.innerHTML = ICONS[name] || ICONS.info; // static, trusted markup only
  return s;
}

// ───────── DOM helper ─────────
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  } else if (attrs != null) kids.unshift(attrs);
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : document.createTextNode(String(k))); }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ───────── controls ─────────
export function toggle(value, onChange, opts = {}) {
  const el = h('button', { class: 'tog' + (value ? ' on' : ''), role: 'switch', 'aria-checked': String(!!value), disabled: opts.disabled });
  el.addEventListener('click', () => { const v = !el.classList.contains('on'); el.classList.toggle('on', v); el.setAttribute('aria-checked', String(v)); onChange?.(v); });
  el.set = (v) => { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', String(!!v)); };
  return el;
}
export function slider({ min = 0, max = 100, step = 1, value = 0, unit = '', onInput, onChange, format }) {
  const out = h('output', {}, '');
  const r = h('input', { type: 'range', min, max, step, value });
  const paint = () => { r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%'); out.textContent = format ? format(Number(r.value)) : r.value + unit; };
  r.addEventListener('input', () => { paint(); onInput?.(Number(r.value)); });
  r.addEventListener('change', () => onChange?.(Number(r.value)));
  paint();
  const el = h('div', { class: 'slider' }, r, out);
  el.set = (v) => { r.value = v; paint(); };
  return el;
}
export function seg(options, value, onChange, opts = {}) {
  const el = h('div', { class: 'seg' });
  const draw = (cur) => { clear(el); for (const o of options) { const [v, label, dis] = Array.isArray(o) ? o : [o, o]; el.append(h('button', { class: v === cur ? 'on' : '', disabled: dis || opts.disabled, onClick: () => { draw(v); onChange?.(v); } }, label)); } };
  draw(value); el.set = draw; return el;
}
export function select(options, value, onChange) {
  const el = h('select', {}, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  el.addEventListener('change', () => { const o = options.find(([v]) => String(v) === el.value); onChange?.(o ? o[0] : el.value); });
  return el;
}
export function colorInput(value, onChange) {
  const i = h('input', { type: 'color', value });
  i.addEventListener('input', () => { wrap.style.background = i.value; onChange?.(i.value); });
  const wrap = h('div', { class: 'color', style: { background: value } }, i);
  wrap.set = (v) => { i.value = v; wrap.style.background = v; };
  return wrap;
}
export function btn(label, { kind = '', icon: ic, onClick, size = '', title } = {}) {
  const b = h('button', { class: `btn ${kind} ${size}`.trim(), title }, ic ? icon(ic) : null, label ? h('span', {}, label) : null);
  b.addEventListener('click', async (e) => {
    if (!onClick || b.classList.contains('busy')) return;
    const r = onClick(e);
    if (r && typeof r.then === 'function') { b.classList.add('busy'); const sp = h('i', { class: 'spin' }); b.prepend(sp); try { await r; } finally { sp.remove(); b.classList.remove('busy'); } }
  });
  return b;
}
export const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
export function field(label, hint, control, { off = false } = {}) {
  return h('div', { class: 'field' + (off ? ' off' : '') }, h('div', { class: 'lbl' }, h('b', {}, label), hint ? h('small', {}, hint) : null), control);
}
export const card = (title, sub, ...kids) => h('section', { class: 'card' }, title ? h('h3', {}, title) : null, sub ? h('div', { class: 'sub' }, sub) : null, ...kids);
export function banner(kind, title, text, buttons = []) {
  return h('div', { class: `banner ${kind}` }, icon(kind === 'info' ? 'info' : 'alert'), h('div', { style: { flex: 1 } }, h('b', {}, title), text ? h('p', {}, text) : null, buttons.length ? h('div', { class: 'btns' }, buttons) : null));
}
export const empty = (ic, title, text, action) => h('div', { class: 'empty' }, icon(ic), h('b', {}, title), h('div', {}, text), action ? h('div', { style: { marginTop: '14px' } }, action) : null);
export const skeleton = (height = 90, extra = {}) => h('div', { class: 'skel', style: { height: height + 'px', ...extra } });
export const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), h('div', { class: 'actions' }, ...actions));

// ───────── toast ─────────
export function toast(kind, title, text, ms = 4200) {
  const root = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}` }, icon(kind === 'success' ? 'check' : kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : 'info'), h('div', {}, h('b', {}, title), text ? h('span', {}, text) : null));
  root.append(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', kill); setTimeout(kill, kind === 'error' ? ms * 2 : ms);
}

// ───────── modal / drawer ─────────
export function modal({ title, body, actions, wide = false, drawer = false, onClose }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const scrim = h('div', { class: 'scrim' + (drawer ? ' drawer-scrim' : '') });
    const close = (v) => { scrim.style.opacity = '0'; setTimeout(() => scrim.remove(), 160); document.removeEventListener('keydown', esc); onClose?.(); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') close(undefined); };
    document.addEventListener('keydown', esc);
    const acts = (actions || []).map((a) => btn(a.label, { kind: a.kind, onClick: async () => { const r = a.onClick ? await a.onClick() : undefined; if (r !== false) close(a.value !== undefined ? a.value : true); } }));
    const box = drawer
      ? h('div', { class: 'drawer' }, h('div', { class: 'modal-h' }, title, h('span', { class: 'sp' }), btn('', { kind: 'ghost icon', icon: 'x', onClick: () => close(undefined) })), h('div', { class: 'modal-b', style: { flex: 1, padding: 0 } }, body), acts.length ? h('div', { class: 'modal-f' }, acts) : null)
      : h('div', { class: 'modal' + (wide ? ' wide' : '') }, h('div', { class: 'modal-h' }, title), h('div', { class: 'modal-b' }, body), acts.length ? h('div', { class: 'modal-f' }, acts) : null);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(undefined); });
    scrim.append(box); root.append(scrim);
    box.close = close;
  });
}
export const confirmDialog = ({ title, text, confirmLabel = 'Подтвердить', danger = false, extra }) =>
  modal({ title, body: h('div', {}, h('p', { style: { margin: '0 0 8px' } }, text), extra || null), actions: [{ label: 'Отмена', value: false }, { label: confirmLabel, kind: danger ? 'danger' : 'primary', value: true }] }).then((v) => v === true);
export function promptDialog({ title, label, value = '', confirmLabel = 'Сохранить' }) {
  const input = h('input', { class: 'input', style: { width: '100%' }, value, placeholder: label, maxlength: 36 });
  setTimeout(() => input.focus(), 50);
  return modal({ title, body: h('div', {}, h('div', { class: 'muted small', style: { marginBottom: '8px' } }, label), input), actions: [{ label: 'Отмена', value: null }, { label: confirmLabel, kind: 'primary', onClick: () => (input.value.trim() ? true : false), value: '__ok' }] })
    .then((v) => (v === '__ok' ? input.value.trim() : null));
}
export function popMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const r = anchor.getBoundingClientRect();
  const m = h('div', { class: 'menu', style: { top: r.bottom + 6 + 'px', left: Math.max(8, r.right - 210) + 'px' } },
    items.map((it) => h('button', { class: it.danger ? 'danger' : '', onClick: () => { m.remove(); it.onClick(); } }, icon(it.icon || 'chevron'), it.label)));
  document.body.append(m);
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
}
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ');
export const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'только что' : s < 3600 ? `${Math.floor(s / 60)} мин назад` : s < 86400 ? `${Math.floor(s / 3600)} ч назад` : new Date(t).toLocaleDateString('ru-RU'); };
