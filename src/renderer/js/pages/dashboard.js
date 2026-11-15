import { h, icon, clear, card, btn, badge, banner, empty, skeleton, pageHead, toast, confirmDialog } from '../ui.js';
import { state, api, bus, navigate } from '../app.js';

const MODE_NAMES = { normal: 'Стандартная', clear: 'Прозрачная', blur: 'Размытие', glass: 'Стекло', acrylic: 'Акрил', opaque: 'Сплошной цвет' };

export async function render(root) {
  const statsBox = h('div', { class: 'grid g4' });
  const bannerBox = h('div');
  const quickBox = h('div', { class: 'quick' });
  const extBox = h('div'); const logBox = h('div', { class: 'log' });
  const canvas = h('canvas', { class: 'chart', width: 900, height: 360 });
  const liveVals = h('div', { class: 'legend' });

  root.append(
    pageHead('Главная', state.app?.os?.display || '', btn('Восстановить вид Windows', { kind: 'ghost', icon: 'undo', onClick: restoreAll }), btn('Настроить панель задач', { kind: 'primary', icon: 'taskbar', onClick: () => navigate('taskbar') })),
    bannerBox, statsBox,
    h('div', { class: 'grid', style: { gridTemplateColumns: '1.5fr 1fr', marginTop: '16px' } },
      card('Нагрузка системы', 'Живые данные · обновляются раз в секунду, пока открыта эта страница', canvas, liveVals),
      card('Быстрые действия', 'Включайте популярные эффекты одним нажатием', quickBox)),
    h('div', { class: 'grid g2', style: { marginTop: '16px' } },
      card('Активные дополнения', 'Работают в фоне независимо от этого окна', extBox),
      card('Недавняя активность', 'Журнал работы приложения', logBox)));

  // ── stats ──
  function drawStats() {
    const a = state.app; clear(statsBox);
    const tb = a.taskbar, active = a.taskbarStatus?.active;
    const stat = (k, ic, v, s, extra) => h('div', { class: 'card stat hover' }, h('div', { class: 'glow' }), h('div', { class: 'k' }, icon(ic), k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s), extra || null);
    statsBox.append(
      stat('Windows', 'window', a.os.name, a.os.display.replace(a.os.name, '').replace(/^\s*/, '') || 'dev-режим'),
      stat('Профиль', 'layers', a.activeProfile.name, a.activeProfile.dirty ? 'Есть изменения относительно профиля' : 'Настройки совпадают с профилем'),
      stat('Панель задач', 'taskbar', active ? 'Кастомизирована' : 'Стандартная', active ? `${MODE_NAMES[tb.mode]}${tb.floating.enabled ? ' · парящая' : ''}${tb.autoHide ? ' · автоскрытие' : ''}` : 'Эффекты выключены'),
      stat('Расширения', 'store', `${a.ext.enabled} активно`, `Установлено ${a.ext.installed} из ${a.ext.available}${a.ext.updates ? ` · обновлений: ${a.ext.updates}` : ''}`));
  }

  // ── banners ──
  async function drawBanners() {
    clear(bannerBox);
    const a = state.app;
    if (!a.win32.available) bannerBox.append(banner(a.os.isWin ? 'bad' : 'info', a.os.isWin ? 'Windows API недоступен' : 'Режим разработки', a.os.isWin ? `Не удалось загрузить нативный слой: ${a.win32.error || 'неизвестная ошибка'}. Эффекты панели задач отключены, остальные функции работают.` : 'Вы запустили приложение не в Windows — системные эффекты отключены, интерфейс полностью рабочий.'));
    if (a.ext.updates) bannerBox.append(banner('info', `Доступны обновления расширений: ${a.ext.updates}`, 'Откройте «Расширения» и обновите их одним нажатием.', [btn('Открыть магазин', { size: 'sm', onClick: () => navigate('extensions') })]));
    if (a.os.isWin) {
      try {
        const r = await api('third.scan', {}, { silent: true });
        for (const c of r.conflicts) {
          const app = r.apps.find((x) => x.id === c.app);
          bannerBox.append(banner('warn', c.title, c.text, c.actions.map((ac) => btn(ac.label, { size: 'sm', onClick: async () => {
            if (ac.type === 'stopApp' && app) { await api('third.stop', { id: app.id }); toast('success', `${app.name} остановлен`); drawBanners(); }
            if (ac.type === 'disableTaskbarFx') { const cfg = { ...a.taskbar, enabled: false }; await api('taskbar.apply', { config: cfg }); toast('success', 'Эффекты панели задач отключены'); drawBanners(); }
          } }))));
        }
      } catch {}
    }
  }

  // ── quick actions ──
  let appr = {};
  async function loadAppr() { try { appr = (await api('appearance.read', {}, { silent: true })).values; } catch {} }
  const applyTb = async (mut) => { const cfg = JSON.parse(JSON.stringify(state.app.taskbar)); mut(cfg); const r = await api('taskbar.apply', { config: cfg }); if (!r.ok) toast('warn', 'Применено с замечаниями', r.errors.map((e) => `${e.id}: ${e.error}`).join('; ')); };
  function drawQuick() {
    clear(quickBox); const tb = state.app.taskbar; const win11 = state.app.os.win11;
    const exts = {}; // filled by drawExt cache
    const q = (ic, title, sub, on, act, disabled) => {
      const el = h('button', { class: 'qa' + (on ? ' on' : ''), disabled, style: disabled ? { opacity: .45 } : null }, icon(ic), h('div', {}, h('b', {}, title), h('small', {}, sub)));
      el.addEventListener('click', async () => { el.style.opacity = .6; try { await act(!on); } catch {} await loadAppr(); drawQuick(); });
      return el;
    };
    const both = (id1, id2, v) => api('appearance.apply', { values: { [id1]: v, [id2]: v } });
    quickBox.append(
      q('taskbar', 'Эффекты панели', tb.enabled ? 'Включены' : 'Выключены', tb.enabled, (v) => applyTb((c) => { c.enabled = v; if (v && c.mode === 'normal') c.mode = 'acrylic'; })),
      q('sparkles', 'Парящая панель', tb.floating.enabled ? 'Скруглённая' : 'На всю ширину', tb.floating.enabled, (v) => applyTb((c) => { c.floating.enabled = v; if (v) c.enabled = true; if (v && c.mode === 'normal') c.mode = 'acrylic'; })),
      q('eye', 'Автоскрытие', tb.autoHide ? 'Панель прячется' : 'Всегда видна', tb.autoHide, (v) => applyTb((c) => { c.autoHide = v; })),
      q('grid', 'Значки по центру', win11 ? (tb.centerIcons ? 'По центру' : 'Слева') : 'Только Windows 11', tb.centerIcons, (v) => applyTb((c) => { c.centerIcons = v; }), !win11),
      q('moon', 'Тёмная тема', appr['fx.appsTheme'] ? 'Включена' : 'Светлая', !!appr['fx.appsTheme'], (v) => both('fx.appsTheme', 'fx.systemTheme', v)),
      q('layers', 'Прозрачность Windows', appr['fx.transparency'] ? 'Mica / Acrylic' : 'Выключена', !!appr['fx.transparency'], (v) => api('appearance.apply', { values: { 'fx.transparency': v } })),
      q('desktop', 'Значки рабочего стола', appr['desktop.hideIcons'] ? 'Скрыты' : 'Видны', !!appr['desktop.hideIcons'], (v) => api('appearance.apply', { values: { 'desktop.hideIcons': v } })),
      q('bolt', 'Dynamic Island', '…', false, async () => navigate('extensions', { open: 'dynamic-island' })));
    api('ext.list', {}, { silent: true }).then((list) => {
      const di = list.find((e) => e.id === 'dynamic-island'); const last = quickBox.lastChild; if (!last || !di) return;
      last.querySelector('small').textContent = di.installed ? (di.enabled ? 'Включён' : 'Выключен') : 'Не установлен — открыть магазин';
      last.classList.toggle('on', di.enabled);
      last.onclick = null; last.replaceWith(last = last.cloneNode(true));
      last.addEventListener('click', async () => { if (!di.installed) return navigate('extensions', { open: 'dynamic-island' }); await api('ext.setEnabled', { id: di.id, on: !di.enabled }); drawQuick(); drawExt(); });
      quickBox.append(last);
    }).catch(() => {});
  }

  // ── extensions ──
  async function drawExt() {
    clear(extBox); extBox.append(skeleton(40), skeleton(40, { marginTop: '8px' }));
    const list = (await api('ext.list', {}, { silent: true })).filter((e) => e.enabled);
    clear(extBox);
    if (!list.length) { extBox.append(empty('store', 'Нет активных дополнений', 'Установите Dynamic Island, системный монитор или часы из магазина.', btn('Открыть магазин', { kind: 'primary', size: 'sm', onClick: () => navigate('extensions') }))); return; }
    for (const e of list) extBox.append(h('div', { class: 'list-row' }, e.icon ? h('img', { class: 'ico sm', src: e.icon }) : h('div', { class: 'ico sm' }), h('div', { style: { flex: 1 } }, h('b', {}, e.name), h('div', { class: 'muted small' }, `v${e.installedVersion} · ${e.category}`)), badge('Работает', 'ok'), (e.windows || []).filter((w) => w.panel).length ? btn('Открыть', { size: 'sm', onClick: () => api('ext.openPanel', { id: e.id, wid: e.windows.find((w) => w.panel).id }) }) : null));
  }

  // ── log ──
  const addLog = (l) => { const d = h('div', { class: l.level }, h('time', {}, new Date(l.t).toLocaleTimeString('ru-RU')), `[${l.scope}] ${l.msg}`.slice(0, 220)); logBox.prepend(d); while (logBox.childNodes.length > 40) logBox.lastChild.remove(); };
  const logs = await api('logs.recent', { n: 30 }, { silent: true }).catch(() => []);
  logs.filter((l) => l.level !== 'DEBUG').forEach(addLog);
  if (!logBox.childNodes.length) logBox.append(h('div', { class: 'muted' }, 'Пока нет событий'));

  // ── live chart ──
  const cpu = Array(60).fill(0), ram = Array(60).fill(0); let last = null;
  const g = canvas.getContext('2d');
  function draw() {
    const w = canvas.width, hh = canvas.height; g.clearRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(128,128,160,.18)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (hh / 4) * i); g.lineTo(w, (hh / 4) * i); g.stroke(); }
    const line = (arr, c1, c2) => {
      g.beginPath(); arr.forEach((v, i) => { const x = (i / 59) * w, y = hh - 8 - (v / 100) * (hh - 20); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = c1; g.stroke();
      g.lineTo(w, hh); g.lineTo(0, hh); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, c2); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fill();
    };
    line(ram, '#22d3ee', 'rgba(34,211,238,.18)'); line(cpu, '#8b5cf6', 'rgba(139,92,246,.28)');
  }
  const onTele = (e) => { const s = e.detail; last = s; cpu.push(s.cpu); cpu.shift(); ram.push(s.ram.pct); ram.shift(); draw();
    clear(liveVals); liveVals.append(...[h('span', {}, h('i', { style: { background: '#8b5cf6' } }), `CPU ${s.cpu}%`), h('span', {}, h('i', { style: { background: '#22d3ee' } }), `RAM ${s.ram.pct}%`), s.gpu != null ? h('span', {}, h('i', { style: { background: '#f472b6' } }), `GPU ${s.gpu}%`) : null, h('span', { class: 'muted' }, `Сеть ↓ ${(s.net.down / 1024).toFixed(0)} КБ/с  ↑ ${(s.net.up / 1024).toFixed(0)} КБ/с`)].filter(Boolean)); };
  bus.addEventListener('telemetry', onTele);
  api('telemetry.start', {}, { silent: true }).then((s) => s && s.ts && onTele({ detail: s })).catch(() => {});
  draw();
  const onLog = (e) => { if (e.detail.level !== 'DEBUG') addLog(e.detail); };
  bus.addEventListener('log', onLog);
  const onState = () => { drawStats(); drawBanners(); loadAppr().then(drawQuick); };
  bus.addEventListener('state', onState);

  drawStats(); drawBanners(); await loadAppr(); drawQuick(); drawExt();

  async function restoreAll() {
    if (!await confirmDialog({ title: 'Восстановить стандартный вид Windows?', text: 'Все изменения панели задач и оформления, сделанные этим приложением, будут отменены. Установленные расширения и профили сохранятся.', confirmLabel: 'Восстановить', danger: true })) return;
    await api('profiles.restoreDefault'); toast('success', 'Стандартный вид Windows восстановлен'); loadAppr().then(drawQuick);
  }
  return () => { bus.removeEventListener('telemetry', onTele); bus.removeEventListener('log', onLog); bus.removeEventListener('state', onState); api('telemetry.stop', {}, { silent: true }).catch(() => {}); };
}
