import { h, icon, clear, card, btn, field, toggle, seg, badge, banner, pageHead, toast, confirmDialog, empty, ago, modal } from '../ui.js';
import { state, api, bus, refreshState } from '../app.js';

export async function render(root) {
  const s = () => state.app.settings;
  const set = (key) => async (v) => { try { await api('app.setSetting', { key, value: v }); } catch {} };
  root.append(pageHead('Настройки', 'Поведение приложения, обновления и резервные копии'));
  const col = h('div', { class: 'stack', style: { maxWidth: '860px' } }); root.append(col);

  // ── appearance + startup ──
  col.append(card('Приложение', null,
    field('Тема интерфейса', 'Тёмная, светлая или как в Windows', seg([['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Системная']], s().theme, set('theme'))),
    field('Запускать вместе с Windows', 'Фоновые эффекты и виджеты восстановятся после перезагрузки', toggle(s().autostart, set('autostart'))),
    field('Запускаться свёрнутым в трей', 'При автозапуске главное окно не открывается', toggle(s().startMinimized, set('startMinimized'))),
    field('Закрытие окна сворачивает в трей', 'Эффекты и виджеты продолжают работать, окно не занимает память', toggle(s().closeToTray, set('closeToTray'))),
    field('Возвращать вид Windows при выходе', 'При полном выходе из программы эффекты панели задач отключаются', toggle(s().restoreOnExit, set('restoreOnExit')))));

  // ── updates ──
  const updBox = h('div');
  const updCard = card('Обновления приложения', 'Настройки, профили и расширения сохраняются при обновлении', updBox);
  col.append(updCard);
  const urlIn = h('input', { class: 'input', style: { width: '320px' }, placeholder: 'https://example.com/hub/update.json', value: s().updateUrl });
  urlIn.addEventListener('change', async () => { try { await api('app.setSetting', { key: 'updateUrl', value: urlIn.value }); toast('success', 'Адрес сохранён'); } catch { urlIn.value = s().updateUrl; } });
  let result = null; const progress = h('div', { class: 'bar', style: { display: 'none', margin: '10px 0' } }, h('i', { style: { width: '0%' } }));
  const stepEl = h('div', { class: 'muted small' });
  const onProg = (e) => { const p = e.detail; if (p.kind === 'update') { progress.style.display = ''; progress.firstChild.style.width = Math.round(p.value * 100) + '%'; } if (p.kind === 'update-step') stepEl.textContent = p.text; };
  bus.addEventListener('progress', onProg);
  const style = document.createElement('style'); style.textContent = '.bar{height:8px;border-radius:99px;background:var(--input);overflow:hidden}.bar>i{display:block;height:100%;background:var(--acc-grad);border-radius:99px;transition:width .3s}'; root.append(style);
  async function drawUpd(info) {
    clear(updBox); const u = await api('update.info');
    updBox.append(field('Текущая версия', `Windows Customization Hub ${state.app.version}`, badge(`v${state.app.version}`, 'acc')),
      field('Сервер обновлений', 'Адрес JSON-манифеста (https). Пока не задан — обновления не проверяются', urlIn),
      h('div', { class: 'row', style: { marginTop: '10px' } }, btn('Проверить обновления', { icon: 'refresh', onClick: async () => { try { result = await api('update.check'); drawUpd(); } catch {} } }), u.rollback ? btn(`Откатить к версии ${u.meta?.version}`, { icon: 'undo', kind: 'danger', onClick: async () => { if (await confirmDialog({ title: 'Откатить приложение?', text: `Будет восстановлена версия ${u.meta?.version}. Настройки и профили не изменятся. Приложение перезапустится.`, confirmLabel: 'Откатить', danger: true })) await api('update.rollback'); } }) : null));
    if (result) {
      if (!result.configured) updBox.append(h('div', { class: 'muted', style: { marginTop: '12px' } }, 'Укажите адрес сервера обновлений, чтобы проверять новые версии.'));
      else if (!result.available) updBox.append(banner('info', 'У вас последняя версия', `Установлена v${result.current}.`));
      else {
        const i = result.info;
        updBox.append(h('div', { style: { marginTop: '14px' } }, banner('info', `Доступна версия ${i.version}`, i.notes.length ? '' : 'Список изменений не указан.'), i.notes.length ? h('ul', { class: 'dim', style: { margin: '0 0 10px', paddingLeft: '20px' } }, i.notes.map((n) => h('li', {}, n))) : null, progress, stepEl,
          h('div', { class: 'row' }, btn('Обновить сейчас', { kind: 'primary', icon: 'download', onClick: async () => { try { if (!(await confirmDialog({ title: `Обновить до ${i.version}?`, text: 'Hub скачает обновление, сохранит настройки и копию текущей версии для отката, затем перезапустится. Настройки, профили и расширения останутся.', confirmLabel: 'Обновить' }))) return; stepEl.textContent = 'Скачиваю…'; await api('update.download'); await api('update.install'); } catch {} } }))));
      }
    }
  }
  drawUpd();

  // ── extensions & developer ──
  const repoIn = h('input', { class: 'input', style: { width: '320px' }, placeholder: 'https://example.com/hub-repo', value: s().repoUrl });
  repoIn.addEventListener('change', async () => { try { await api('app.setSetting', { key: 'repoUrl', value: repoIn.value }); toast('success', 'Репозиторий сохранён'); } catch { repoIn.value = s().repoUrl; } });
  col.append(card('Расширения', 'Магазин проверяет подпись и контрольную сумму каждого пакета',
    field('Свой репозиторий расширений', 'Дополнительный источник поверх встроенного. Только https и только подписанные пакеты', repoIn),
    field('Режим разработчика', 'Разрешает ставить .wcx без доверенной подписи — такие расширения получают лишь безопасные разрешения', toggle(s().developerMode, set('developerMode')))));

  // ── backups ──
  const bkBox = h('div');
  async function drawBackups() {
    clear(bkBox); const list = await api('backups.list');
    if (!list.length) bkBox.append(empty('shield', 'Резервных копий пока нет', 'Копия создаётся автоматически перед каждым изменением панели, оформления и профилей.'));
    for (const b of list.slice(0, 8)) bkBox.append(h('div', { class: 'list-row' }, icon('shield'), h('div', { style: { flex: 1 } }, h('b', {}, b.label), h('div', { class: 'muted small' }, `${new Date(b.t).toLocaleString('ru-RU')} · ${ago(b.t)}`)), btn('Восстановить', { size: 'sm', onClick: async () => { if (await confirmDialog({ title: 'Восстановить эту конфигурацию?', text: `Состояние на ${new Date(b.t).toLocaleString('ru-RU')} вернётся: панель задач, оформление и профиль.`, confirmLabel: 'Восстановить' })) { await api('backups.restore', { id: b.id }); toast('success', 'Конфигурация восстановлена'); drawBackups(); } } })));
  }
  col.append(card('Резервные копии', 'Автоматические снимки настроек. Хранится 25 последних', bkBox, h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Создать копию сейчас', { icon: 'plus', onClick: async () => { await api('backups.create'); toast('success', 'Копия создана'); drawBackups(); } }), btn('Открыть папку', { icon: 'folder', kind: 'ghost', onClick: () => api('app.openPath', { which: 'backups' }) }))));
  drawBackups();

  // ── logs ──
  col.append(card('Журнал работы', 'Диагностика и ошибки. Файлы хранятся 14 дней', h('div', { class: 'row' }, btn('Показать последние события', { icon: 'activity', onClick: async () => {
      const logs = await api('logs.recent', { n: 200 });
      modal({ title: 'Журнал', wide: true, body: h('div', { class: 'log', style: { maxHeight: '60vh' } }, logs.length ? logs.slice().reverse().map((l) => h('div', { class: l.level }, h('time', {}, new Date(l.t).toLocaleTimeString('ru-RU')), `[${l.level}] ${l.scope}: ${l.msg}`)) : h('div', { class: 'muted' }, 'Пусто')), actions: [{ label: 'Закрыть' }] });
    } }), btn('Открыть папку журналов', { icon: 'folder', kind: 'ghost', onClick: () => api('app.openPath', { which: 'logs' }) }))));

  // ── about + danger ──
  col.append(card('О программе', null, h('dl', { class: 'kv' },
    h('dt', {}, 'Версия'), h('dd', {}, state.app.version), h('dt', {}, 'Система'), h('dd', {}, state.app.os.display), h('dt', {}, 'Нативный слой'), h('dd', {}, state.app.win32.available ? 'Windows API подключён' : `Недоступен${state.app.win32.error ? ': ' + state.app.win32.error : ''}`),
    h('dt', {}, 'Движок'), h('dd', {}, `Electron ${state.app.electron}`), h('dt', {}, 'Данные'), h('dd', {}, h('a', { class: 'muted', style: { cursor: 'pointer', textDecoration: 'underline' }, onClick: () => api('app.openPath', { which: 'config' }) }, 'Открыть папку настроек')))));
  col.append(card('Опасная зона', 'Откатывает всё к заводским значениям. Профили и расширения останутся',
    btn('Сбросить все настройки Hub', { kind: 'danger', icon: 'trash', onClick: async () => { if (await confirmDialog({ title: 'Сбросить все настройки?', text: 'Вид Windows будет восстановлен, настройки приложения вернутся к значениям по умолчанию.', confirmLabel: 'Сбросить', danger: true })) { await api('app.resetAll'); await refreshState(); toast('success', 'Настройки сброшены'); } } })));
  return () => bus.removeEventListener('progress', onProg);
}
