import { h, icon, clear, card, btn, badge, banner, pageHead, toast, confirmDialog, promptDialog, popMenu, skeleton, empty } from '../ui.js';
import { state, api, bus } from '../app.js';
import { renderPreview } from '../preview.js';

export async function render(root) {
  const grid = h('div', { class: 'prof-grid' });
  root.append(pageHead('Профили', 'Сохраняйте наборы настроек и переключайтесь между ними одним нажатием',
    btn('Импорт', { icon: 'upload', onClick: async () => { try { const p = await api('profiles.import'); if (p) { toast('success', `Профиль «${p.name}» импортирован`); load(); } } catch {} } }),
    btn('Сохранить текущие настройки', { kind: 'primary', icon: 'plus', onClick: async () => { const name = await promptDialog({ title: 'Новый профиль', label: 'Название профиля', value: 'Мой профиль' }); if (name) { await api('profiles.create', { name }); toast('success', 'Профиль сохранён'); load(); } } })),
    grid);
  grid.append(...Array.from({ length: 6 }, () => skeleton(260)));
  let active = '';
  async function load() {
    const r = await api('profiles.list'); active = r.active; clear(grid);
    for (const p of r.profiles) grid.append(cardFor(p));
  }
  function cardFor(p) {
    const isActive = p.id === active; const dirty = isActive && state.app.activeProfile.dirty;
    const more = btn('', { kind: 'ghost icon', icon: 'more', onClick: (e) => popMenu(e.currentTarget, [
      ...(!p.builtin ? [{ label: 'Обновить из текущих настроек', icon: 'refresh', onClick: async () => { await api('profiles.update', { id: p.id }); toast('success', 'Профиль обновлён'); load(); } }] : []),
      { label: 'Дублировать', icon: 'copy', onClick: async () => { await api('profiles.duplicate', { id: p.id }); load(); } },
      ...(!p.builtin ? [{ label: 'Переименовать', icon: 'edit', onClick: async () => { const n = await promptDialog({ title: 'Переименовать', label: 'Название', value: p.name }); if (n) { await api('profiles.rename', { id: p.id, name: n }); load(); } } }] : []),
      { label: 'Экспорт в файл', icon: 'download', onClick: async () => { const f = await api('profiles.export', { id: p.id }); if (f) toast('success', 'Профиль экспортирован', f); } },
      ...(!p.builtin && p.id !== 'custom' ? [{ label: 'Удалить', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Удалить «${p.name}»?`, text: 'Профиль будет удалён безвозвратно.', confirmLabel: 'Удалить', danger: true })) { await api('profiles.remove', { id: p.id }); load(); } } }] : []),
    ]) });
    return h('article', { class: 'card prof' + (isActive ? ' active' : '') },
      renderPreview(p.taskbar, { wall: ['aurora', 'sunset', 'forest', 'light'][(p.name.length) % 4], width: 280, win11: state.app.os.win11 }),
      h('h4', {}, p.icon || '✦', ' ', p.name, h('span', { class: 'sp' }), isActive ? badge(dirty ? 'Активен · изменён' : 'Активен', 'ok') : null, p.builtin ? badge('Встроенный') : badge('Мой', 'acc')),
      h('p', {}, p.description || 'Пользовательский профиль'),
      h('div', { class: 'acts' }, btn(isActive && !dirty ? 'Применён' : 'Применить', { kind: 'primary', size: 'sm', icon: 'check', onClick: async () => { await apply(p); } }), h('span', { class: 'sp' }), more));
  }
  async function apply(p) {
    const r = await api('profiles.apply', { id: p.id });
    if (r.errors?.length) toast('warn', `Профиль «${p.name}» применён частично`, r.errors.map((e) => `${e.id}: ${e.error}`).join('\n')); else toast('success', `Профиль «${p.name}» применён`, state.app.os.isWin ? 'Перезагрузка не требуется' : 'Режим разработки');
    if (r.needsExplorerRestart && await confirmDialog({ title: 'Обновить Проводник?', text: 'Часть параметров профиля применится после перезапуска Проводника.', confirmLabel: 'Перезапустить' })) await api('app.restartExplorer');
    load();
  }
  await load();
  root.append(h('div', { style: { marginTop: '22px' } }, card('Стандартный вид Windows', 'Откатывает всё, что изменило приложение, к исходным значениям Windows. Профили и расширения не затрагиваются.', btn('Восстановить стандартный вид', { kind: 'danger', icon: 'undo', onClick: async () => { if (await confirmDialog({ title: 'Восстановить стандартный вид Windows?', text: 'Эффекты панели задач будут выключены, а системные параметры вернутся к исходным значениям.', confirmLabel: 'Восстановить', danger: true })) { await api('profiles.restoreDefault'); toast('success', 'Стандартный вид восстановлен'); load(); } } }))));
  const onState = () => load(); bus.addEventListener('state', onState);
  return () => bus.removeEventListener('state', onState);
}
