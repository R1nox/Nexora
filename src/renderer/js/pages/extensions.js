import { h, icon, clear, card, btn, field, toggle, slider, seg, select, colorInput, badge, banner, pageHead, toast, modal, confirmDialog, skeleton, empty, fmtSize } from '../ui.js';
import { state, api, bus } from '../app.js';

const CATS = [['all', 'Все расширения', 'grid'], ['Widgets', 'Виджеты', 'sparkles'], ['Taskbar', 'Панель задач', 'taskbar'], ['System', 'Система', 'cpu'], ['Media', 'Медиа', 'play'], ['Productivity', 'Продуктивность', 'bolt'], ['Utilities', 'Утилиты', 'tool']];
const HIGH = new Set(['audio.control', 'media.control', 'apps.launch', 'system.settings', 'network']);

export async function render(root, params = {}) {
  let list = [], perms = {}, cat = 'all', q = '', filter = 'all', sort = 'name';
  const grid = h('div', { class: 'ext-grid' }), cats = h('div', { class: 'cats' }), info = h('div');
  const search = h('input', { class: 'input', placeholder: 'Поиск по названию и описанию…', style: { flex: 1 }, onInput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const filt = seg([['all', 'Все'], ['installed', 'Установленные'], ['updates', 'Обновления']], filter, (v) => { filter = v; draw(); });
  const sorter = select([['name', 'По названию'], ['category', 'По категории'], ['size', 'По размеру']], sort, (v) => { sort = v; draw(); });
  const devBtn = btn('Установить из файла .wcx', { icon: 'upload', size: 'sm', onClick: async () => { try { const m = await api('ext.installFile'); if (m) { toast('success', `Установлено: ${m.name}`, 'Расширение без доверенной подписи — выдан ограниченный набор разрешений'); await load(); } } catch {} } });
  root.append(pageHead('Магазин расширений', 'Устанавливайте, обновляйте и отключайте дополнения. Все пакеты проверяются цифровой подписью.', state.app.settings.developerMode ? devBtn : null, btn('Обновить список', { icon: 'refresh', onClick: async () => { const r = await api('ext.refresh'); list = r.list; if (r.error) toast('warn', 'Репозиторий недоступен', r.error); draw(); } })),
    info, h('div', { class: 'store' }, cats, h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, search, filt, sorter), grid)));
  grid.append(...Array.from({ length: 6 }, () => skeleton(210)));

  async function load() { [list, perms] = await Promise.all([api('ext.list'), api('ext.permissions')]); draw(); }
  function draw() {
    clear(cats); for (const [id, label, ic] of CATS) { const n = list.filter((e) => id === 'all' || e.category === id).length; if (id !== 'all' && !n) continue; cats.append(h('button', { class: id === cat ? 'on' : '', onClick: () => { cat = id; draw(); } }, icon(ic), label, h('span', { class: 'n' }, n))); }
    let items = list.filter((e) => (cat === 'all' || e.category === cat) && (!q || (e.name + e.description + e.author).toLowerCase().includes(q)) && (filter === 'all' || (filter === 'installed' && e.installed) || (filter === 'updates' && e.updateAvailable)));
    items.sort((a, b) => sort === 'size' ? b.size - a.size : sort === 'category' ? a.category.localeCompare(b.category) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    clear(grid);
    if (!items.length) grid.append(h('div', { style: { gridColumn: '1/-1' } }, empty('search', 'Ничего не найдено', 'Измените запрос или фильтр.')));
    for (const e of items) grid.append(cardFor(e));
    clear(info); const rs = state.app.settings;
    if (rs.repoUrl) info.append(h('div', { class: 'muted small', style: { marginBottom: '12px' } }, `Репозиторий: ${rs.repoUrl}`));
  }
  function actionBtn(e, size = 'sm') {
    const on = async (fn, okMsg) => { try { await fn(); toast('success', okMsg); await load(); } catch {} };
    if (!e.installed) return e.compatible ? btn('Установить', { kind: 'primary', size, icon: 'download', onClick: () => on(() => api('ext.install', { id: e.id }), `${e.name} установлено`) }) : badge(e.incompatReason || 'Несовместимо', 'warn');
    if (e.updateAvailable) return btn(`Обновить до ${e.latestVersion}`, { kind: 'primary', size, icon: 'refresh', onClick: () => on(() => api('ext.install', { id: e.id }), `${e.name} обновлено`) });
    return badge('Установлено', 'ok');
  }
  function cardFor(e) {
    return h('article', { class: 'card hover ext', onClick: () => openDetail(e.id) },
      h('div', { class: 'top' }, e.icon ? h('img', { class: 'ico lg', src: e.icon }) : h('div', { class: 'ico lg' }), h('div', { style: { minWidth: 0 } }, h('h4', {}, e.name), h('div', { class: 'by' }, e.author))),
      h('p', {}, e.description),
      h('div', { class: 'meta' }, e.signed ? badge('✓ Подписано', 'ok') : badge('Без подписи', 'warn'), badge(`v${e.installedVersion || e.version}`), badge(fmtSize(e.size)), badge(e.category, 'acc')),
      h('div', { class: 'foot' }, h('span', { class: 'muted small' }, e.compat?.windows ? `Windows ${e.compat.windows.join(' / ')}` : 'Windows 10/11'), h('span', { class: 'sp' }), h('span', { onClick: (ev) => ev.stopPropagation() }, actionBtn(e))));
  }

  async function openDetail(id, tab = 'overview') {
    let e = list.find((x) => x.id === id); if (!e) return;
    const content = h('div'); const tabsEl = h('div', { class: 'tabs' });
    const refresh = async () => { await load(); e = list.find((x) => x.id === id); draw2(); };
    const tabBtn = (t, label) => h('button', { class: t === tab ? 'on' : '', onClick: () => { tab = t; draw2(); } }, label);
    async function draw2() {
      clear(tabsEl); tabsEl.append(tabBtn('overview', 'Обзор'), ...(e.installed ? [tabBtn('settings', 'Настройки'), tabBtn('log', 'Журнал')] : []));
      clear(content);
      if (tab === 'overview') {
        content.append(h('div', { style: { padding: '20px 24px' } },
          e.preview ? h('img', { class: 'preview-img', src: e.preview }) : null,
          h('div', { class: 'row', style: { margin: '16px 0 4px' } }, e.icon ? h('img', { class: 'ico lg', src: e.icon }) : null, h('div', {}, h('h2', { style: { margin: 0 } }, e.name), h('div', { class: 'muted' }, `${e.author} · ${e.category}`)), h('span', { class: 'sp' })),
          h('div', { class: 'row wrap', style: { margin: '10px 0' } }, actionBtn(e, ''), e.installed ? [h('div', { class: 'row' }, toggle(e.enabled, async (v) => { try { await api('ext.setEnabled', { id, on: v }); await refresh(); } catch { await refresh(); } }), h('span', { class: 'dim' }, e.enabled ? 'Включено' : 'Выключено')), e.windows?.some((w) => w.panel) && e.enabled ? btn('Открыть панель', { size: 'sm', onClick: () => api('ext.openPanel', { id, wid: e.windows.find((w) => w.panel).id }) }) : null, btn('Удалить', { kind: 'danger', size: 'sm', icon: 'trash', onClick: () => uninstall(e) })] : null),
          h('p', { class: 'dim' }, e.description),
          h('h3', { style: { margin: '18px 0 6px' } }, 'Что понадобится расширению'),
          e.permissions?.length ? h('div', {}, e.permissions.map((p) => h('div', { class: 'perm' + (HIGH.has(p) ? ' high' : '') }, icon(HIGH.has(p) ? 'alert' : 'shield'), h('div', { style: { flex: 1 } }, h('b', {}, perms[p] || p), h('div', { class: 'muted small mono' }, p)), e.installed ? toggle(e.grantedPermissions?.includes(p), async (v) => { await api('ext.setPermission', { id, perm: p, on: v }); toast('info', v ? 'Разрешение выдано' : 'Разрешение отозвано', 'Окна расширения перезапущены'); await refresh(); }, { disabled: !e.signed && !['storage', 'settings', 'notifications', 'window', 'system.info'].includes(p) }) : null))) : h('div', { class: 'muted' }, 'Без особых разрешений'),
          e.installed && !e.signed ? banner('warn', 'Расширение без доверенной подписи', 'Ему выданы только безопасные разрешения. Системные функции недоступны.') : null,
          e.installed && e.integrityOk === false ? banner('bad', 'Файлы расширения изменены', 'Контрольные суммы не совпадают. Переустановите расширение.') : null,
          h('h3', { style: { margin: '18px 0 8px' } }, 'Сведения'),
          h('dl', { class: 'kv' }, h('dt', {}, 'Версия'), h('dd', {}, e.installed ? `${e.installedVersion}${e.updateAvailable ? ` (доступна ${e.latestVersion})` : ''}` : e.version), h('dt', {}, 'Размер'), h('dd', {}, fmtSize(e.size)),
            h('dt', {}, 'Совместимость'), h('dd', {}, e.compat?.windows ? `Windows ${e.compat.windows.join(', ')}${e.compat.minBuild ? ` (сборка ${e.compat.minBuild}+)` : ''}` : 'Windows 10/11'),
            h('dt', {}, 'Зависимости'), h('dd', {}, Object.keys(e.dependencies || {}).length ? Object.entries(e.dependencies).map(([k, v]) => `${k} ${v}`).join(', ') : 'Нет'),
            h('dt', {}, 'Подпись'), h('dd', {}, e.signed ? 'Проверена (Ed25519)' : 'Нет'), h('dt', {}, 'Источник'), h('dd', {}, e.sideloaded ? 'Локальный файл' : e.source === 'remote' ? 'Сетевой репозиторий' : 'Встроенный репозиторий')),
          e.changelog?.length ? [h('h3', { style: { margin: '18px 0 6px' } }, 'Что нового'), h('ul', { class: 'dim', style: { margin: 0, paddingLeft: '18px' } }, e.changelog.map((c) => h('li', {}, c)))] : null));
      } else if (tab === 'settings') {
        const box = h('div', { style: { padding: '8px 24px 24px' } }); content.append(box);
        const s = e.settings || {}; const schema = e.settingsSchema || [];
        if (!schema.length) box.append(empty('settings', 'Нет настроек', 'У этого расширения нет настраиваемых параметров.'));
        const save = (k) => (v) => api('ext.setSettings', { id, patch: { [k]: v } });
        for (const f of schema) {
          let ctl;
          if (f.type === 'toggle') ctl = toggle(s[f.key], save(f.key));
          else if (f.type === 'slider') ctl = slider({ min: f.min ?? 0, max: f.max ?? 100, value: s[f.key], onChange: save(f.key) });
          else if (f.type === 'select') ctl = f.options.length <= 3 ? seg(f.options, s[f.key], save(f.key)) : select(f.options, s[f.key], save(f.key));
          else if (f.type === 'color') { let t; ctl = colorInput(s[f.key], (v) => { clearTimeout(t); t = setTimeout(() => save(f.key)(v), 250); }); }
          else if (f.type === 'text' || f.type === 'hotkey') { const i = h('input', { class: 'input', value: s[f.key] || '', placeholder: f.type === 'hotkey' ? 'Например Ctrl+Alt+V' : '' }); i.addEventListener('change', () => save(f.key)(i.value)); ctl = i; }
          else if (f.type === 'apps') {
            const wrap = h('div', { class: 'stack', style: { alignItems: 'flex-end' } });
            const drawApps = (apps) => { clear(wrap); wrap.append(h('div', { class: 'muted small' }, apps.length ? apps.map((a) => a.name).join(', ') : 'Список пуст'), btn('Добавить приложение…', { size: 'sm', icon: 'plus', onClick: async () => { const r = await api('ext.pickApp', { id }); if (r) { const fresh = await api('ext.list'); const ne = fresh.find((x) => x.id === id); drawApps(ne.settings.apps || []); } } })); };
            drawApps(s[f.key] || []); ctl = wrap;
          }
          box.append(field(f.label, f.description, ctl));
        }
      } else {
        const lines = await api('ext.log', { id }); const lg = h('div', { class: 'log', style: { margin: '16px 24px', maxHeight: '420px' } }, lines.length ? lines.map((l) => h('div', {}, l)) : h('div', { class: 'muted' }, 'Журнал пуст')); content.append(lg);
      }
    }
    await draw2();
    modal({ title: e.name, body: h('div', {}, tabsEl, content), drawer: true });
  }
  async function uninstall(e) {
    let keep = false; const cb = h('label', { class: 'row', style: { marginTop: '10px' } }, toggle(false, (v) => (keep = v)), h('span', {}, 'Сохранить настройки расширения'));
    if (!await confirmDialog({ title: `Удалить «${e.name}»?`, text: 'Окна расширения закроются, файлы будут удалены.', confirmLabel: 'Удалить', danger: true, extra: cb })) return;
    try { await api('ext.uninstall', { id: e.id, keepData: keep }); toast('success', `${e.name} удалено`); document.querySelector('.drawer-scrim')?.remove(); await load(); } catch {}
  }
  await load();
  api('ext.refresh', {}, { silent: true }).then((r) => { if (r.error) info.append(banner('warn', 'Сетевой репозиторий недоступен', `${r.error}. Показаны встроенные расширения и сохранённый кэш.`)); list = r.list; draw(); }).catch(() => {});
  if (params.open) openDetail(params.open);
  const onState = () => load(); bus.addEventListener('state', onState);
  return () => bus.removeEventListener('state', onState);
}
