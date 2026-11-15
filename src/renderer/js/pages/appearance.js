import { h, icon, clear, card, btn, field, toggle, slider, seg, select, badge, banner, pageHead, toast, confirmDialog, skeleton, empty } from '../ui.js';
import { state, api, navigate, bus } from '../app.js';

const MODULES = [
  ['desktop', 'Рабочий стол', 'desktop', 'Обои, значки и Проводник'], ['window', 'Окна', 'window', 'Заголовки, привязка и перетаскивание'], ['cursor', 'Курсор', 'cursor', 'Размер, скорость, след'],
  ['start', 'Меню «Пуск»', 'start', 'Макет и содержимое'], ['animations', 'Системные анимации', 'film', 'Плавность интерфейса'], ['effects', 'Визуальные эффекты', 'sparkles', 'Тема, прозрачность, шрифты'],
  ['widgets', 'Мини-приложения', 'grid', 'Кнопки Windows и виджеты Hub'], ['quick', 'Быстрые настройки', 'bolt', 'Панели быстрого доступа Hub'],
];

export async function render(root, params = {}) {
  let mod = params.module || localStorage.getItem('wch.appmod') || 'desktop';
  root.append(skeleton(40, { width: '60%' }), skeleton(300, { marginTop: '16px' }));
  const [defs, read] = await Promise.all([api('appearance.describe'), api('appearance.read')]);
  let base = { ...read.values }, cur = { ...read.values };
  const dirtyIds = () => Object.keys(cur).filter((k) => cur[k] !== base[k]);
  clear(root);

  const tabs = h('div', { class: 'mod-tabs' });
  const body = h('div', { class: 'stack' });
  const bar = h('div', { class: 'applybar' });
  root.append(pageHead('Оформление', 'Каждый модуль управляет отдельной частью Windows. Все изменения обратимы.'), tabs, body, bar);

  function control(d) {
    const set = (v) => { cur[d.id] = v; refreshBar(); };
    if (d.type === 'toggle') return toggle(cur[d.id], set);
    if (d.type === 'slider') return slider({ min: d.min, max: d.max, step: d.step || 1, value: cur[d.id], onInput: set });
    if (d.type === 'select') { const opts = d.options.map(([v, l]) => [v, l]); return opts.length <= 3 ? seg(opts, cur[d.id], set) : select(opts, cur[d.id], set); }
    if (d.type === 'file') {
      const lbl = h('span', { class: 'muted small', style: { maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' } }, cur[d.id] ? cur[d.id] : 'Не выбрано');
      return h('div', { class: 'row' }, lbl, btn('Выбрать…', { size: 'sm', onClick: async () => { const p = await api('appearance.pickImage'); if (p) { cur[d.id] = p; lbl.textContent = p; refreshBar(); } } }));
    }
    return h('span');
  }
  function drawModule() {
    clear(body);
    if (mod === 'quick') return drawExtModule(['quick-settings', 'volume-control', 'app-launcher'], 'Панели быстрого доступа', 'Открываются по горячей клавише или из значка в трее. Управляются как расширения.');
    const list = defs.filter((d) => d.module === mod);
    const groups = [...new Set(list.map((d) => d.group))];
    for (const g of groups) {
      body.append(card(g, null, ...list.filter((d) => d.group === g).map((d) => {
        const unsupported = !d.supported;
        const hint = unsupported ? (d.requires === 'win11' ? 'Только в Windows 11' : 'Только в Windows 10') : d.note;
        const c = control(d); if (unsupported) c.querySelectorAll?.('button,input,select').forEach((n) => (n.disabled = true));
        return field(d.label, hint, c, { off: unsupported });
      })));
    }
    if (mod === 'widgets') drawExtModule(null, 'Виджеты рабочего стола Hub', 'Часы, погода, мониторы и музыка. Включаются здесь же, а подробные настройки — в магазине.', true);
    if (mod === 'effects') body.append(h('div', { class: 'banner info' }, icon('info'), h('div', {}, h('b', {}, 'Mica и Acrylic'), h('p', {}, 'Эффекты прозрачности Windows включаются здесь, а материал самой панели задач выбирается на странице «Панель задач».'))));
    if (mod === 'cursor') body.append(h('div', { class: 'banner info' }, icon('info'), h('div', {}, h('b', {}, 'Размер указателя'), h('p', {}, 'Изменение размера может полностью вступить в силу только после повторного входа в Windows.'))));
  }
  async function drawExtModule(ids, title, sub, append = false) {
    const holder = h('div', {}, skeleton(60)); const c = card(title, sub, holder); body.append(c);
    const list = (await api('ext.list')).filter((e) => (ids ? ids.includes(e.id) : (e.windows ? true : true) && ['clock-widget', 'weather-widget', 'system-monitor', 'network-monitor', 'music-widget', 'dynamic-island'].includes(e.id)));
    clear(holder);
    for (const e of list) {
      const t = e.installed ? toggle(e.enabled, async (v) => { try { await api('ext.setEnabled', { id: e.id, on: v }); } catch { t.set(!v); } }) : btn('Установить', { size: 'sm', kind: 'primary', icon: 'download', onClick: async () => { await api('ext.install', { id: e.id }); toast('success', `${e.name} установлено`); drawModule(); } });
      holder.append(h('div', { class: 'list-row' }, e.icon ? h('img', { class: 'ico sm', src: e.icon }) : null, h('div', { style: { flex: 1 } }, h('b', {}, e.name), h('div', { class: 'muted small' }, e.description.slice(0, 90) + (e.description.length > 90 ? '…' : ''))),
        e.installed ? btn('Настройки', { size: 'sm', kind: 'ghost', onClick: () => navigate('extensions', { open: e.id }) }) : null,
        e.installed && e.windows?.some((w) => w.panel) ? btn('Открыть', { size: 'sm', onClick: () => api('ext.openPanel', { id: e.id, wid: e.windows.find((w) => w.panel).id }) }) : null, t));
    }
    if (!list.length) holder.append(empty('store', 'Расширения недоступны', 'Откройте магазин, чтобы установить виджеты.'));
  }

  function drawTabs() {
    clear(tabs);
    for (const [id, label, ic] of MODULES) tabs.append(h('button', { class: id === mod ? 'on' : '', onClick: () => { mod = id; localStorage.setItem('wch.appmod', id); drawTabs(); drawModule(); } }, icon(ic), label));
  }
  function refreshBar() { bar.classList.toggle('dirty', dirtyIds().length > 0); counter.textContent = `Изменено параметров: ${dirtyIds().length}`; }
  const counter = h('span', {});
  async function apply() {
    const ids = dirtyIds(); if (!ids.length) return;
    const values = Object.fromEntries(ids.map((i) => [i, cur[i]]));
    const r = await api('appearance.apply', { values });
    const fresh = await api('appearance.read'); base = { ...fresh.values }; cur = { ...fresh.values };
    refreshBar(); drawModule();
    if (r.errors.length) toast('warn', 'Применено частично', r.errors.map((e) => `${e.id}: ${e.error}`).join('\n')); else toast('success', 'Оформление обновлено', `Изменено параметров: ${r.changed}`);
    if (r.needsRelogin) toast('info', 'Нужен повторный вход', 'Размер указателя полностью применится после выхода из Windows и входа.');
    if (r.needsExplorerRestart && await confirmDialog({ title: 'Обновить Проводник?', text: 'Некоторые параметры Проводника применятся сразу после его перезапуска. Окна приложений не закроются.', confirmLabel: 'Перезапустить Проводник' })) await api('app.restartExplorer');
  }
  bar.append(btn('Сбросить модуль', { kind: 'danger', icon: 'undo', onClick: async () => {
      const ids = defs.filter((d) => d.module === mod).map((d) => d.id); if (!ids.length) return toast('info', 'В этом модуле нет системных параметров');
      if (!await confirmDialog({ title: 'Сбросить модуль к исходным значениям?', text: 'Параметры вернутся к тем значениям, которые были в Windows до первого изменения этим приложением.', confirmLabel: 'Сбросить', danger: true })) return;
      const r = await api('appearance.reset', { ids }); const fresh = await api('appearance.read'); base = { ...fresh.values }; cur = { ...fresh.values }; drawModule(); refreshBar(); toast('success', 'Модуль сброшен', `Восстановлено параметров: ${r.reset}`);
    } }), h('div', { class: 'dirty' }, icon('alert'), counter), h('span', { class: 'sp' }), btn('Отмена', { onClick: () => { cur = { ...base }; drawModule(); refreshBar(); } }), btn('Применить', { kind: 'primary', icon: 'check', onClick: apply }));
  drawTabs(); drawModule(); refreshBar();
}
