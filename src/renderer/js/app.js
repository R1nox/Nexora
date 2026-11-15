import { h, icon, clear, toast, btn, banner } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as taskbarPage from './pages/taskbar.js';
import * as appearance from './pages/appearance.js';
import * as extensions from './pages/extensions.js';
import * as installed from './pages/installed.js';
import * as profiles from './pages/profiles.js';
import * as settings from './pages/settings.js';

export const state = { app: null, ext: [] };
export const api = async (name, payload, { silent = false } = {}) => {
  try { return await window.api.invoke(name, payload); }
  catch (e) { const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); if (!silent) toast('error', 'Ошибка', msg); throw new Error(msg); }
};
export const bus = new EventTarget();

const PAGES = [
  { id: 'dashboard', label: 'Главная', icon: 'dashboard', mod: dashboard, group: 'ОБЗОР' },
  { id: 'taskbar', label: 'Панель задач', icon: 'taskbar', mod: taskbarPage, group: 'КАСТОМИЗАЦИЯ' },
  { id: 'appearance', label: 'Оформление', icon: 'palette', mod: appearance, group: 'КАСТОМИЗАЦИЯ' },
  { id: 'extensions', label: 'Расширения', icon: 'store', mod: extensions, group: 'КАСТОМИЗАЦИЯ' },
  { id: 'installed', label: 'Установленные', icon: 'box', mod: installed, group: 'УПРАВЛЕНИЕ' },
  { id: 'profiles', label: 'Профили', icon: 'layers', mod: profiles, group: 'УПРАВЛЕНИЕ' },
  { id: 'settings', label: 'Настройки', icon: 'settings', mod: settings, group: 'ПРИЛОЖЕНИЕ' },
];
let current = null, currentCleanup = null, navToken = 0;

export function navigate(id, params = {}) {
  const page = PAGES.find((p) => p.id === id) || PAGES[0];
  const token = ++navToken;
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }
  current = page.id; location.hash = page.id;
  renderSidebar(); renderTopbar(page);
  const root = document.getElementById('page'); clear(root); root.scrollTop = 0;
  const wrap = h('div', { class: 'page' }); root.append(wrap);
  Promise.resolve(page.mod.render(wrap, params)).then((cleanup) => { if (token === navToken) currentCleanup = cleanup; else cleanup?.(); }).catch((e) => {
    wrap.append(banner('bad', 'Не удалось открыть страницу', String(e.message || e)));
    console.error(e);
  });
}

function renderSidebar() {
  const s = document.getElementById('sidebar'); clear(s);
  s.append(h('div', { class: 'brand' }, h('img', { src: 'assets/icon.png', alt: '' }), h('div', {}, h('b', {}, 'Customization Hub'), h('small', {}, `v${state.app?.version || ''} · ${state.app?.os?.win11 ? 'Windows 11' : state.app?.os?.isWin ? 'Windows 10' : 'dev'}`))));
  let last = '';
  const nav = h('nav', { class: 'nav' });
  for (const p of PAGES) {
    if (p.group !== last) { nav.append(h('div', { class: 'nav-label' }, p.group)); last = p.group; }
    const upd = p.id === 'extensions' ? state.app?.ext?.updates : 0;
    nav.append(h('a', { class: p.id === current ? 'active' : '', tabindex: 0, role: 'link', onClick: () => navigate(p.id), onKeydown: (e) => { if (e.key === 'Enter') navigate(p.id); } }, icon(p.icon), p.label, upd ? h('span', { class: 'count' }, upd) : null));
  }
  s.append(nav);
  const active = state.app?.taskbarStatus?.active;
  s.append(h('div', { class: 'side-foot' }, h('span', { class: 'dot ' + (state.app?.win32?.available ? (active ? 'ok' : 'warn') : 'bad') }), state.app?.win32?.available ? (active ? 'Эффекты активны' : 'Эффекты выключены') : 'Windows API недоступен'));
}

let searchIndex = [];
function renderTopbar(page) {
  const t = document.getElementById('topbar'); clear(t);
  const input = h('input', { placeholder: 'Поиск настроек, страниц и расширений…', spellcheck: 'false' });
  const results = h('div', { class: 'search-results', style: { display: 'none' } });
  let sel = 0, list = [];
  const draw = () => {
    clear(results); const q = input.value.trim().toLowerCase();
    list = q ? searchIndex.filter((x) => x.label.toLowerCase().includes(q) || (x.hint || '').toLowerCase().includes(q)).slice(0, 9) : [];
    results.style.display = list.length ? '' : 'none'; sel = 0;
    list.forEach((x, i) => results.append(h('div', { class: i === sel ? 'sel' : '', onMousedown: (e) => { e.preventDefault(); go(x); } }, icon(x.icon || 'search'), x.label, h('small', {}, x.hint || ''))));
  };
  const go = (x) => { input.value = ''; draw(); navigate(x.page, x.params); };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && list[sel]) go(list[sel]); if (e.key === 'Escape') { input.value = ''; draw(); input.blur(); } });
  input.addEventListener('blur', () => setTimeout(() => (results.style.display = 'none'), 120));
  window.focusSearch = () => input.focus();
  t.append(h('div', { class: 'crumbs' }, 'Hub', icon('chevron'), h('b', {}, page.label)), h('div', { class: 'search' }, icon('search'), input, h('kbd', {}, 'Ctrl K'), results));
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); window.focusSearch?.(); } });

async function buildSearchIndex() {
  searchIndex = PAGES.map((p) => ({ label: p.label, page: p.id, icon: p.icon, hint: 'Страница' }));
  try {
    const defs = await api('appearance.describe', {}, { silent: true });
    for (const d of defs) searchIndex.push({ label: d.label, page: 'appearance', params: { module: d.module }, icon: 'palette', hint: 'Оформление' });
    for (const e of await api('ext.list', {}, { silent: true })) searchIndex.push({ label: e.name, page: 'extensions', params: { open: e.id }, icon: 'store', hint: 'Расширение' });
  } catch {}
}

export async function refreshState() {
  state.app = await api('app.state', {}, { silent: true });
  document.documentElement.dataset.theme = effectiveTheme();
  renderSidebar();
  bus.dispatchEvent(new CustomEvent('state', { detail: state.app }));
}
function effectiveTheme() {
  const t = state.app?.settings?.theme;
  if (t === 'light') return 'light'; if (t === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; return 'dark';
}

(async function boot() {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.theme = 'dark';
  if (q.get('mica') === '1') document.documentElement.dataset.material = 'mica';
  window.api.on('toast', (t) => toast(t.kind || 'info', t.title || t.text, t.title ? t.text : ''));
  window.api.on('state', (s) => { state.app = s; document.documentElement.dataset.theme = effectiveTheme(); renderSidebar(); bus.dispatchEvent(new CustomEvent('state', { detail: s })); });
  window.api.on('telemetry', (t) => bus.dispatchEvent(new CustomEvent('telemetry', { detail: t })));
  window.api.on('log', (l) => bus.dispatchEvent(new CustomEvent('log', { detail: l })));
  window.api.on('progress', (p) => bus.dispatchEvent(new CustomEvent('progress', { detail: p })));
  await refreshState();
  buildSearchIndex();
  navigate(location.hash.slice(1) || 'dashboard');
})();
