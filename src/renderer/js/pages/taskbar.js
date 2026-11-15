import { h, icon, clear, card, btn, field, toggle, slider, seg, select, colorInput, badge, banner, pageHead, toast, confirmDialog, skeleton } from '../ui.js';
import { state, api, bus } from '../app.js';
import { renderPreview, update, wallpapers } from '../preview.js';

const MATS = [
  ['normal', 'Стандартная', 'Как в Windows', 'rgba(28,28,32,.9)'],
  ['clear', 'Прозрачная', 'Полностью без фона', 'repeating-conic-gradient(#8884 0 25%,transparent 0 50%) 0 0/10px 10px'],
  ['blur', 'Размытие', 'Blur за панелью', 'linear-gradient(135deg,rgba(139,92,246,.5),rgba(34,211,238,.35))'],
  ['glass', 'Стекло', 'Glass с бликом', 'linear-gradient(180deg,rgba(255,255,255,.4),rgba(139,92,246,.3))'],
  ['acrylic', 'Акрил', 'Acrylic + шум', 'linear-gradient(135deg,rgba(124,58,237,.7),rgba(30,27,75,.6))'],
  ['opaque', 'Сплошной цвет', 'Выбранный цвет', '#2a2a3a'],
];
const clone = (o) => JSON.parse(JSON.stringify(o));
// copy values into existing objects so references held by the controls stay valid
const assignDeep = (t, s) => { for (const k of Object.keys(s)) { if (s[k] && typeof s[k] === 'object') assignDeep(t[k], s[k]); else t[k] = s[k]; } };

export async function render(root) {
  root.append(pageHead('Панель задач', 'Прозрачность, форма, поведение и эффекты. Изменения видны в превью до применения.'), h('div', { class: 'tb-layout' }, h('div', {}, skeleton(300), skeleton(120, { marginTop: '16px' })), h('div', {}, skeleton(200), skeleton(200, { marginTop: '16px' }))));
  const data = await api('taskbar.get');
  const win11 = data.win11, isWin = state.app.os.isWin;
  // start from what Windows really has right now, so the UI never lies about the current state
  const merge = (c, o) => { const m = clone(c); const keepPos = win11; m.centerIcons = o.centerIcons; m.autoHide = o.autoHide; m.iconSize = o.iconSize; if (!keepPos) m.position = o.position; m.hide.taskView = o.taskView; m.hide.widgets = o.widgets; m.hide.chat = o.chat; m.hide.search = o.search; return m; };
  let base = isWin ? merge(data.config, data.os) : clone(data.config);
  let cur = clone(base), wall = localStorage.getItem('wch.wall') || 'aurora';
  const dirty = () => JSON.stringify(cur) !== JSON.stringify(base);

  clear(root);
  const desk = renderPreview(cur, { wall, win11 });
  const wallChips = h('div', { class: 'chips' }, wallpapers.map((w) => h('span', { class: 'chip' + (w === wall ? ' on' : ''), onClick: (e) => { wall = w; localStorage.setItem('wch.wall', w); desk.querySelector('.wall').style.background = ''; const nd = renderPreview(cur, { wall, win11 }); desk.querySelector('.wall').style.background = nd.querySelector('.wall').style.background; wallChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.target)); } }, { aurora: 'Аврора', sunset: 'Закат', light: 'Светлая', forest: 'Лес' }[w])));
  const bar = h('div', { class: 'applybar' });
  const redraw = () => { update(desk, cur, win11); bar.classList.toggle('dirty', dirty()); };

  // ── helpers ──
  const set = (fn) => (v) => { fn(v); redraw(); syncEnabled(); };
  const refs = {};
  const setGeo = (fn) => (v) => { fn(v); cur.enabled = true; refs.master && refs.master.set(true); redraw(); syncEnabled(); };
  const rowOff = (el, off) => { el.classList.toggle('off', off); el.querySelectorAll('input,button,select').forEach((n) => { n.disabled = off; }); };

  // ── 1. material ──
  const matGrid = h('div', { class: 'mat-grid' });
  const drawMats = () => { clear(matGrid); for (const [id, name, sub, bg] of MATS) matGrid.append(h('button', { class: 'mat' + (cur.mode === id ? ' on' : ''), onClick: () => { cur.mode = id; if (id !== 'normal') cur.enabled = true; refs.master.set(cur.enabled); drawMats(); redraw(); syncEnabled(); } }, h('div', { class: 'sw', style: { background: bg } }), h('b', {}, name), h('small', {}, sub))); };
  refs.master = toggle(cur.enabled, set((v) => (cur.enabled = v)));
  refs.color = colorInput(cur.color, set((v) => (cur.color = v)));
  refs.opacity = slider({ min: 0, max: 100, value: cur.opacity, unit: '%', onInput: set((v) => (cur.opacity = v)) });
  const matCard = card('Материал', 'Как выглядит фон панели задач', field('Включить эффекты панели задач', 'Пока выключено — панель выглядит стандартно', refs.master), matGrid,
    refs.colorF = field('Цвет панели', 'Тон, который накладывается на материал', refs.color), refs.opF = field('Непрозрачность тона', '0 — только материал, 100 — сплошной цвет', refs.opacity));
  const note = isWin ? null : banner('info', 'Превью без применения', 'Вы запустили приложение не в Windows: превью работает, но применить эффекты нельзя.');

  // ── 2. shape ──
  const fl = cur.floating;
  refs.fl = toggle(fl.enabled, set((v) => (fl.enabled = v)));
  refs.mx = slider({ min: 0, max: 900, step: 2, value: fl.marginX, unit: ' px', onInput: set((v) => (fl.marginX = v)) });
  refs.it = slider({ min: 0, max: 12, value: fl.insetTop, unit: ' px', onInput: set((v) => (fl.insetTop = v)) });
  refs.ib = slider({ min: 0, max: 12, value: fl.insetBottom, unit: ' px', onInput: set((v) => (fl.insetBottom = v)) });
  refs.rad = slider({ min: 0, max: 32, value: fl.radius, unit: ' px', onInput: set((v) => (fl.radius = v)) });
  const sz = cur.size;
  refs.sh = slider({ min: 0, max: 120, step: 2, value: sz.height, format: (v) => (v === 0 ? 'Как в Windows' : v + ' px'), onInput: setGeo((v) => (sz.height = v)) });
  refs.sw = slider({ min: 30, max: 100, value: sz.widthPct, unit: ' %', onInput: setGeo((v) => (sz.widthPct = v)) });
  refs.sa = seg([['left', 'Слева'], ['center', 'По центру'], ['right', 'Справа']], sz.align, setGeo((v) => (sz.align = v)));
  const posSeg = seg([['bottom', 'Снизу'], ['top', 'Сверху'], ['left', 'Слева', win11], ['right', 'Справа', win11]], cur.position, setGeo((v) => (cur.position = v)), {});
  const sizeSeg = seg([['small', 'Мелкие'], ['default', 'Обычные'], ['large', 'Крупные', !win11]], cur.iconSize, set((v) => (cur.iconSize = v)));
  refs.center = toggle(cur.centerIcons, set((v) => (cur.centerIcons = v)), { disabled: !win11 });
  const shapeCard = card('Форма, размер и положение', 'Парящий режим обрезает панель по скруглённому контуру — как RoundedTB',
    field('Парящая панель со скруглением', 'Включает отступы и скругление углов', refs.fl),
    refs.mxF = field('Отступы по бокам', 'Чем больше — тем короче панель (длина)', refs.mx),
    refs.itF = field('Отступ сверху', 'Срезает верхнюю кромку панели', refs.it),
    refs.ibF = field('Отступ снизу', 'Приподнимает нижнюю кромку', refs.ib),
    refs.radF = field('Скругление углов', undefined, refs.rad),
    field('Положение на экране', win11 ? 'Снизу или сверху. Сверху на Windows 11 — экспериментально: Hub сам удерживает панель вверху' : 'Переносит панель; потребуется перезапуск Проводника', posSeg),
    win11 ? refs.shF = field('Высота панели', 'Свободная высота. Рабочая область окон подстраивается автоматически', refs.sh) : null,
    win11 ? refs.swF = field('Ширина панели', 'Доля ширины экрана — панель становится короче', refs.sw) : null,
    win11 ? refs.saF = field('Выравнивание короткой панели', undefined, refs.sa) : null,
    field('Размер значков', win11 ? 'Windows 11: мелкие / обычные / крупные' : 'Windows 10: обычные или мелкие', sizeSeg),
    field('Значки по центру', win11 ? 'Выравнивание кнопки «Пуск» и значков' : 'Только в Windows 11', refs.center, { off: !win11 }));

  // ── 3. behaviour ──
  refs.ah = toggle(cur.autoHide, set((v) => (cur.autoHide = v)));
  refs.tv = toggle(cur.hide.taskView, set((v) => (cur.hide.taskView = v)));
  refs.wg = toggle(cur.hide.widgets, set((v) => (cur.hide.widgets = v)), { disabled: !win11 });
  refs.ch = toggle(cur.hide.chat, set((v) => (cur.hide.chat = v)), { disabled: !win11 });
  const searchSel = select([['default', 'Как сейчас'], ['hidden', 'Скрыть'], ['icon', 'Только значок'], ['box', 'Поле поиска']], cur.hide.search, set((v) => (cur.hide.search = v)));
  const behCard = card('Поведение и элементы', 'Используются официальные настройки Windows — обратимо в один клик',
    field('Автоматическое скрытие', 'Панель прячется, пока курсор не у края экрана', refs.ah),
    field('Скрыть «Представление задач»', undefined, refs.tv), field('Скрыть «Мини-приложения»', win11 ? 'Windows блокирует эту кнопку на новых сборках — тогда используйте «Оформление → Мини-приложения»' : 'Только Windows 11', refs.wg, { off: !win11 }),
    field('Скрыть «Чат»', win11 ? undefined : 'Только Windows 11', refs.ch, { off: !win11 }), field('Поиск на панели', undefined, searchSel));

  // ── 4. overlay ──
  const o = cur.overlay;
  refs.ov = toggle(o.enabled, set((v) => (o.enabled = v)));
  refs.gE = toggle(o.gradient.enabled, set((v) => (o.gradient.enabled = v)));
  refs.g1 = colorInput(o.gradient.from, set((v) => (o.gradient.from = v))); refs.g2 = colorInput(o.gradient.to, set((v) => (o.gradient.to = v)));
  refs.gA = slider({ min: 0, max: 360, value: o.gradient.angle, unit: '°', onInput: set((v) => (o.gradient.angle = v)) });
  refs.gO = slider({ min: 0, max: 100, value: o.gradient.opacity, unit: '%', onInput: set((v) => (o.gradient.opacity = v)) });
  refs.glE = toggle(o.glow.enabled, set((v) => (o.glow.enabled = v)));
  refs.glC = colorInput(o.glow.color, set((v) => (o.glow.color = v)));
  refs.glI = slider({ min: 0, max: 100, value: o.glow.intensity, unit: '%', onInput: set((v) => (o.glow.intensity = v)) });
  refs.shE = toggle(o.shadow.enabled, set((v) => (o.shadow.enabled = v)));
  refs.shB = slider({ min: 0, max: 80, value: o.shadow.blur, unit: ' px', onInput: set((v) => (o.shadow.blur = v)) });
  refs.shO = slider({ min: 0, max: 100, value: o.shadow.opacity, unit: '%', onInput: set((v) => (o.shadow.opacity = v)) });
  const ovCard = card('Градиент, свечение и тень', 'Рисуются отдельным прозрачным окном поверх панели — нативная панель такого не умеет',
    field('Включить эффекты поверх панели', 'Окно не перехватывает клики и прячется, когда панель скрыта', refs.ov),
    refs.ovBody = h('div', {},
      field('Градиент', undefined, refs.gE), refs.gF1 = field('Цвета градиента', 'Начало и конец', h('div', { class: 'row' }, refs.g1, refs.g2)), refs.gF2 = field('Угол', undefined, refs.gA), refs.gF3 = field('Сила градиента', undefined, refs.gO),
      field('Свечение кромки', undefined, refs.glE), refs.glF1 = field('Цвет свечения', undefined, refs.glC), refs.glF2 = field('Интенсивность', undefined, refs.glI),
      field('Тень', 'Мягкая тень над панелью', refs.shE), refs.shF1 = field('Размытие тени', undefined, refs.shB), refs.shF2 = field('Плотность тени', undefined, refs.shO)));

  const limits = h('details', { class: 'card' }, h('summary', {}, icon('info'), 'Что Windows не позволяет менять'),
    h('ul', { class: 'limits', style: { margin: 0, paddingLeft: '18px' } },
      h('li', {}, h('b', {}, 'Цвет при наведении на значки. '), 'Подсветка кнопок рисуется системным XAML, нативных настроек нет. Заменяется свечением и градиентом выше.'),
      h('li', {}, h('b', {}, 'Расстояние между значками. '), 'Системные значки подстраиваются сами; свободный шаг не настраивается.'),
      h('li', {}, h('b', {}, 'Высота, ширина и «Сверху» в Windows 11. '), 'Microsoft этого не поддерживает, поэтому Hub двигает окно панели сам и сразу возвращает, если Проводник её сдвинет. Меню «Пуск» и всплывающие панели по-прежнему открываются у нижнего края. Кнопка «Сбросить к стандарту Windows» всё возвращает.'),
      h('li', {}, h('b', {}, 'Слева и справа в Windows 11. '), 'Не реализовано: вертикальная панель в Windows 11 ломает раскладку. В Windows 10 работает через перезапуск Проводника.'),
      h('li', {}, h('b', {}, 'Mica на панели задач. '), 'Mica доступна только окнам приложений — для панели используйте Акрил или Стекло. Само приложение использует Mica в Windows 11.'),
      h('li', {}, h('b', {}, 'Кнопки «Мини-приложения» и «Чат». '), 'На свежих сборках Windows 11 защита UCPD блокирует запись этих параметров — приложение сообщит об этом.')));

  // ── layout ──
  const preview = h('div', { class: 'preview-col' },
    card('Живой предпросмотр', 'Так панель будет выглядеть после применения', desk, h('div', { class: 'pv-caption', style: { marginTop: '12px' } }, icon('info'), 'Размытие и цвета зависят от ваших обоев.'), h('div', { style: { marginTop: '10px' } }, wallChips)));
  const cfgCol = h('div', { class: 'cfg-col' }, note, matCard, shapeCard, behCard, ovCard, limits);
  root.append(pageHead('Панель задач', 'Прозрачность, форма, поведение и эффекты. Изменения видны в превью до применения.'), h('div', { class: 'tb-layout' }, preview, cfgCol));

  // ── apply bar ──
  const syncAll = () => {
    refs.master.set(cur.enabled); refs.color.set(cur.color); refs.opacity.set(cur.opacity); refs.fl.set(fl.enabled); refs.mx.set(fl.marginX); refs.it.set(fl.insetTop); refs.ib.set(fl.insetBottom); refs.rad.set(fl.radius);
    posSeg.set(cur.position); if (win11) { refs.sh.set(cur.size.height); refs.sw.set(cur.size.widthPct); refs.sa.set(cur.size.align); } sizeSeg.set(cur.iconSize); refs.center.set(cur.centerIcons); refs.ah.set(cur.autoHide); refs.tv.set(cur.hide.taskView); refs.wg.set(cur.hide.widgets); refs.ch.set(cur.hide.chat); searchSel.value = cur.hide.search;
    refs.ov.set(o.enabled); refs.gE.set(o.gradient.enabled); refs.g1.set(o.gradient.from); refs.g2.set(o.gradient.to); refs.gA.set(o.gradient.angle); refs.gO.set(o.gradient.opacity);
    refs.glE.set(o.glow.enabled); refs.glC.set(o.glow.color); refs.glI.set(o.glow.intensity); refs.shE.set(o.shadow.enabled); refs.shB.set(o.shadow.blur); refs.shO.set(o.shadow.opacity); drawMats();
  };
  function syncEnabled() {
    rowOff(refs.colorF, !['blur', 'glass', 'acrylic', 'opaque'].includes(cur.mode)); rowOff(refs.opF, !['blur', 'glass', 'acrylic', 'opaque'].includes(cur.mode));
    for (const k of ['mxF', 'itF', 'ibF', 'radF']) rowOff(refs[k], !fl.enabled);
    refs.ovBody.style.opacity = o.enabled ? 1 : .45; refs.ovBody.style.pointerEvents = o.enabled ? '' : 'none';
    for (const k of ['gF1', 'gF2', 'gF3']) rowOff(refs[k], !o.gradient.enabled); for (const k of ['glF1', 'glF2']) rowOff(refs[k], !o.glow.enabled); for (const k of ['shF1', 'shF2']) rowOff(refs[k], !o.shadow.enabled);
    // keep Windows-version restrictions even after a re-enable
    if (!win11) { refs.wg.disabled = refs.ch.disabled = refs.center.disabled = true; } else { posSeg.querySelectorAll('button').forEach((b) => { if (b.textContent === 'Слева' || b.textContent === 'Справа') b.disabled = true; }); }
  }
  async function apply() {
    const r = await api('taskbar.apply', { config: cur });
    const fresh = await api('taskbar.get'); base = isWin ? merge(fresh.config, fresh.os) : clone(fresh.config);
    bar.classList.toggle('dirty', dirty());
    if (r.errors?.length) toast('warn', 'Применено частично', r.errors.map((e) => `${e.id}: ${/denied|отказ/i.test(e.error) ? 'доступ запрещён системой (защита Windows)' : e.error}`).join('\n'));
    else toast('success', 'Панель задач обновлена', isWin ? '' : 'Режим разработки: системные вызовы не выполнялись');
    if (r.needsExplorerRestart && await confirmDialog({ title: 'Перезапустить Проводник?', text: 'Чтобы изменение размера значков или положения панели вступило в силу, нужно перезапустить Проводник. Окна приложений останутся открытыми, панель на секунду исчезнет.', confirmLabel: 'Перезапустить' })) { await api('app.restartExplorer'); toast('info', 'Проводник перезапущен'); }
  }
  bar.append(btn('Сбросить к стандарту Windows', { kind: 'danger', icon: 'undo', onClick: async () => { if (await confirmDialog({ title: 'Вернуть стандартную панель задач?', text: 'Эффекты будут выключены, а размер значков, положение, скрытые элементы и автоскрытие вернутся к значениям, которые были до первого изменения этим приложением.', confirmLabel: 'Вернуть', danger: true })) { await api('taskbar.restoreDefaults'); const f = await api('taskbar.get'); base = merge(f.config, f.os); assignDeep(cur, clone(base)); syncAll(); redraw(); syncEnabled(); toast('success', 'Панель задач вернулась к стандартной'); } } }),
    h('div', { class: 'dirty' }, icon('alert'), 'Есть непримённые изменения'), h('span', { class: 'sp' }),
    btn('Отмена', { onClick: () => { assignDeep(cur, clone(base)); syncAll(); redraw(); syncEnabled(); } }), btn('Применить', { kind: 'primary', icon: 'check', onClick: apply }));
  root.append(bar);
  drawMats(); syncEnabled(); redraw();
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && dirty()) apply(); };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
