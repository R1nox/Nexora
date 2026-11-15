import { h, icon, clear, card, btn, toggle, badge, banner, pageHead, toast, confirmDialog, skeleton, empty, fmtSize, ago } from '../ui.js';
import { state, api, navigate, bus } from '../app.js';

const AREA = { taskbar: 'Панель задач', start: 'Меню «Пуск»', explorer: 'Проводник', desktop: 'Рабочий стол' };

export async function render(root, params = {}) {
  let tab = params.tab || 'ext';
  const tabs = h('div', { class: 'tabs', style: { padding: 0, marginBottom: '16px' } });
  const body = h('div');
  root.append(pageHead('Установленное', 'Расширения Hub и сторонние программы кастомизации Windows'), tabs, body);

  const drawTabs = () => { clear(tabs); for (const [id, l] of [['ext', 'Расширения'], ['apps', 'Программы кастомизации']]) tabs.append(h('button', { class: id === tab ? 'on' : '', onClick: () => { tab = id; drawTabs(); drawBody(); } }, l)); };
  const drawBody = () => (tab === 'ext' ? drawExt() : drawApps());

  // ───────── extensions ─────────
  async function drawExt() {
    clear(body); body.append(skeleton(70), skeleton(70, { marginTop: '10px' }));
    const list = (await api('ext.list')).filter((e) => e.installed);
    clear(body);
    if (!list.length) return body.append(card(null, null, empty('store', 'Расширения не установлены', 'В магазине есть Dynamic Island, мониторы системы, часы, погода и другое.', btn('Открыть магазин', { kind: 'primary', onClick: () => navigate('extensions') }))));
    const c = card(`Расширения (${list.length})`, 'Каждое расширение работает в изолированном окне и имеет только выданные разрешения');
    for (const e of list) {
      const hasPanel = e.windows?.some((w) => w.panel);
      c.append(h('div', { class: 'app-row' },
        e.icon ? h('img', { class: 'ico lg', src: e.icon }) : h('div', { class: 'ico lg' }),
        h('div', { class: 'info' }, h('b', {}, e.name), h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '3px' } }, badge(`v${e.installedVersion}`), e.signed ? badge('✓ Подписано', 'ok') : badge('Без подписи', 'warn'), e.updateAvailable ? badge(`Обновление ${e.latestVersion}`, 'info') : null, e.integrityOk === false ? badge('Файлы изменены', 'bad') : null, badge(fmtSize(e.size)), e.installedAt ? h('span', { class: 'muted small' }, 'установлено ' + ago(e.installedAt)) : null)),
        h('div', { class: 'btns' },
          e.updateAvailable ? btn('Обновить', { kind: 'primary', size: 'sm', icon: 'refresh', onClick: async () => { await api('ext.install', { id: e.id }); toast('success', `${e.name} обновлено`); drawExt(); } }) : null,
          hasPanel && e.enabled ? btn('Открыть', { size: 'sm', onClick: () => api('ext.openPanel', { id: e.id, wid: e.windows.find((w) => w.panel).id }) }) : null,
          btn('Настройки', { size: 'sm', onClick: () => navigate('extensions', { open: e.id }) }),
          btn('', { kind: 'ghost icon', icon: 'trash', title: 'Удалить', onClick: async () => { if (await confirmDialog({ title: `Удалить «${e.name}»?`, text: 'Окна закроются, файлы расширения будут удалены.', confirmLabel: 'Удалить', danger: true })) { try { await api('ext.uninstall', { id: e.id, keepData: false }); toast('success', 'Удалено'); drawExt(); } catch {} } } }),
          toggle(e.enabled, async (v) => { try { await api('ext.setEnabled', { id: e.id, on: v }); toast('info', v ? `${e.name} включено` : `${e.name} выключено`); } catch { drawExt(); } }))));
    }
    body.append(c);
  }

  // ───────── third-party apps ─────────
  async function drawApps() {
    clear(body); body.append(skeleton(80), skeleton(80, { marginTop: '10px' }), skeleton(80, { marginTop: '10px' }));
    if (!state.app.os.isWin) { clear(body); return body.append(banner('info', 'Режим разработки', 'Обнаружение сторонних программ работает только в Windows.')); }
    let r; try { r = await api('third.scan'); } catch { return; }
    clear(body);
    for (const c of r.conflicts) {
      const app = r.apps.find((x) => x.id === c.app);
      body.append(banner('warn', c.title, c.text, c.actions.map((ac) => btn(ac.label, { size: 'sm', onClick: async () => { if (ac.type === 'stopApp' && app) { await api('third.stop', { id: app.id }); toast('success', `${app.name} остановлен`); } if (ac.type === 'disableTaskbarFx') { await api('taskbar.apply', { config: { ...state.app.taskbar, enabled: false } }); toast('success', 'Эффекты панели задач отключены'); } drawApps(); } }))));
    }
    const found = r.apps.filter((a) => a.installed), missing = r.apps.filter((a) => !a.installed && !a.manual);
    const c = card(`Найдено программ: ${found.length}`, 'Hub только запускает и останавливает их и ничего не меняет в их файлах и настройках');
    if (!found.length) c.append(empty('box', 'Совместимых программ не найдено', 'Установите TranslucentTB, Windhawk, RoundedTB, Rainmeter или добавьте свою программу вручную.'));
    for (const a of found) {
      c.append(h('div', { class: 'app-row' }, h('div', { class: 'ico lg', style: { display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '18px', background: 'var(--acc-grad)', color: '#fff' } }, a.name[0]),
        h('div', { class: 'info' }, h('b', {}, a.name), h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '3px' } }, a.noProcess ? badge(a.running ? 'Активна (в Проводнике)' : 'Установлена', a.running ? 'ok' : '') : badge(a.running ? 'Запущена' : 'Остановлена', a.running ? 'ok' : ''), a.version ? badge(`v${a.version}`) : badge('версия неизвестна'), ...a.modifies.map((m) => badge(AREA[m] || m, 'acc')), a.manual ? badge('Добавлена вручную') : null),
          h('div', { class: 'muted small', style: { marginTop: '4px' } }, a.path || a.note)),
        h('div', { class: 'btns' },
          a.running && a.canStop ? btn('Остановить', { size: 'sm', icon: 'stop', onClick: async () => { await api('third.stop', { id: a.id }); await new Promise((r) => setTimeout(r, 700)); drawApps(); } }) : null,
          !a.running && a.canStart ? btn('Запустить', { size: 'sm', kind: 'primary', icon: 'play', onClick: async () => { await api('third.start', { id: a.id }); await new Promise((r) => setTimeout(r, 1200)); drawApps(); } }) : null,
          a.url ? btn('', { kind: 'ghost icon', icon: 'link', title: 'Сайт программы', onClick: () => api('app.openExternal', { url: a.url }) }) : null,
          a.manual ? btn('', { kind: 'ghost icon', icon: 'trash', title: 'Убрать из списка', onClick: async () => { await api('third.removeManual', { id: a.id }); drawApps(); } }) : null)));
    }
    body.append(c);
    body.append(h('div', { class: 'row', style: { margin: '14px 0' } }, btn('Добавить программу вручную…', { icon: 'plus', onClick: async () => { try { if (await api('third.addManual')) drawApps(); } catch {} } }), btn('Проверить снова', { icon: 'refresh', onClick: () => drawApps() })));
    if (missing.length) body.append(card('Поддерживаемые, но не установленные', 'Hub обнаружит их автоматически после установки', h('div', { class: 'chips' }, missing.map((a) => h('span', { class: 'chip', title: a.note, onClick: () => a.url && api('app.openExternal', { url: a.url }) }, a.name)))));
  }
  drawTabs(); drawBody();
  const onState = () => { if (tab === 'ext') drawExt(); }; bus.addEventListener('state', onState);
  return () => bus.removeEventListener('state', onState);
}
