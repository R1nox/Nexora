'use strict';
// Declarative description of every OS setting the app can manage. The UI is generated from this list,
// and every entry is backed by an official registry value or SystemParametersInfo action (reversible).
const ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const PERS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const DWM = 'HKCU\\Software\\Microsoft\\Windows\\DWM';
const SRCH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search';
const DESK = 'HKCU\\Control Panel\\Desktop';
const CUR = 'HKCU\\Control Panel\\Cursors';
const ACC = 'HKCU\\Software\\Microsoft\\Accessibility';
const FEEDS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Feeds';

const dword = (key, name, extra = {}) => ({ kind: 'reg', key, name, type: 'REG_DWORD', ...extra });
const toggleReg = (id, module, group, label, key, name, o = {}) => ({
  id, module, group, label, type: 'toggle', default: o.default ?? true,
  src: dword(key, name, { on: o.invert ? 0 : 1, off: o.invert ? 1 : 0 }), ...o,
});
const spiToggle = (id, module, group, label, get, set, o = {}) => ({
  id, module, group, label, type: 'toggle', default: o.default ?? true, src: { kind: 'spi', get, set, mode: o.mode || 'bool' }, ...o,
});

const defs = [
  // ───────── Desktop ─────────
  { id: 'desktop.wallpaper', module: 'desktop', group: 'Фон', label: 'Обои рабочего стола', type: 'file', filters: ['jpg', 'jpeg', 'png', 'bmp'], src: { kind: 'wallpaper' }, default: '' },
  { id: 'desktop.wallpaperFit', module: 'desktop', group: 'Фон', label: 'Режим обоев', type: 'select', default: 'fill',
    options: [['fill', 'Заполнение'], ['fit', 'По размеру'], ['stretch', 'Растянуть'], ['tile', 'Плитка'], ['center', 'По центру'], ['span', 'Расширение']], src: { kind: 'wallpaperFit' } },
  toggleReg('desktop.hideIcons', 'desktop', 'Значки', 'Скрыть значки рабочего стола', ADV, 'HideIcons', { default: false, post: 'desktopIcons' }),
  toggleReg('desktop.fileExt', 'desktop', 'Проводник', 'Показывать расширения файлов', ADV, 'HideFileExt', { invert: true, default: false, post: 'explorer' }),
  { id: 'desktop.hidden', module: 'desktop', group: 'Проводник', label: 'Показывать скрытые файлы', type: 'toggle', default: false, post: 'explorer',
    src: dword(ADV, 'Hidden', { on: 1, off: 2 }) },
  toggleReg('desktop.listShadow', 'desktop', 'Значки', 'Тени подписей значков', ADV, 'ListviewShadow', { default: true, post: 'explorer' }),

  // ───────── Windows (title bars, snapping) ─────────
  toggleReg('window.accentTitle', 'window', 'Заголовки', 'Акцентный цвет в заголовках и рамках окон', DWM, 'ColorPrevalence', { default: false, post: 'theme' }),
  spiToggle('window.snap', 'window', 'Привязка окон', 'Привязка окон к краям (Snap)', 0x82, 0x83, { mode: 'bool' }),
  toggleReg('window.snapFlyout', 'window', 'Привязка окон', 'Панель Snap Layouts при наведении на «Развернуть»', ADV, 'EnableSnapAssistFlyout', { default: true, requires: 'win11' }),
  toggleReg('window.shake', 'window', 'Привязка окон', 'Свернуть остальные окна встряхиванием заголовка', ADV, 'DisallowShaking', { invert: true, default: true }),
  spiToggle('window.dragFull', 'window', 'Перетаскивание', 'Показывать содержимое окна при перетаскивании', 0x26, 0x25, { mode: 'bool' }),

  // ───────── Cursor ─────────
  { id: 'cursor.size', module: 'cursor', group: 'Размер', label: 'Размер указателя', type: 'slider', min: 1, max: 15, step: 1, default: 1,
    src: { kind: 'cursorSize' } },
  { id: 'cursor.speed', module: 'cursor', group: 'Поведение', label: 'Скорость указателя', type: 'slider', min: 1, max: 20, step: 1, default: 10,
    src: { kind: 'spi', get: 0x70, set: 0x71, mode: 'pvInt' } },
  { id: 'cursor.trail', module: 'cursor', group: 'Поведение', label: 'След указателя (0 — выкл.)', type: 'slider', min: 0, max: 7, step: 1, default: 0,
    src: { kind: 'spi', get: 0x5E, set: 0x5D, mode: 'uiParam' } },
  spiToggle('cursor.shadow', 'cursor', 'Поведение', 'Тень указателя', 0x101A, 0x101B, { default: true }),
  spiToggle('cursor.sonar', 'cursor', 'Поведение', 'Показывать расположение указателя по Ctrl', 0x101C, 0x101D, { default: false }),

  // ───────── Start menu ─────────
  { id: 'start.layout', module: 'start', group: 'Макет', label: 'Макет меню «Пуск»', type: 'select', default: 0, requires: 'win11',
    options: [[0, 'По умолчанию'], [1, 'Больше закреплённых'], [2, 'Больше рекомендаций']], src: dword(ADV, 'Start_Layout') },
  toggleReg('start.recentDocs', 'start', 'Содержимое', 'Недавно открытые файлы', ADV, 'Start_TrackDocs', { default: true }),
  toggleReg('start.recentApps', 'start', 'Содержимое', 'Часто используемые приложения', ADV, 'Start_TrackProgs', { default: true }),
  toggleReg('start.tips', 'start', 'Содержимое', 'Подсказки и рекомендации', ADV, 'Start_IrisRecommendations', { default: true, requires: 'win11' }),
  toggleReg('start.accountNotifs', 'start', 'Содержимое', 'Уведомления об учётной записи', ADV, 'Start_AccountNotifications', { default: true, requires: 'win11' }),

  // ───────── System animations ─────────
  { id: 'anim.minmax', module: 'animations', group: 'Окна', label: 'Анимация сворачивания и разворачивания', type: 'toggle', default: true, src: { kind: 'minAnimate' } },
  spiToggle('anim.client', 'animations', 'Окна', 'Анимация элементов внутри окон', 0x1042, 0x1043),
  spiToggle('anim.menu', 'animations', 'Меню', 'Анимация меню', 0x1002, 0x1003),
  spiToggle('anim.tooltip', 'animations', 'Меню', 'Анимация подсказок', 0x1016, 0x1017),
  spiToggle('anim.fade', 'animations', 'Меню', 'Плавное затухание пунктов меню', 0x1014, 0x1015),
  spiToggle('anim.combo', 'animations', 'Меню', 'Плавное раскрытие списков', 0x1004, 0x1005),
  toggleReg('anim.taskbar', 'animations', 'Панель задач', 'Анимация кнопок панели задач', ADV, 'TaskbarAnimations', { default: true, post: 'explorer' }),

  // ───────── Visual effects ─────────
  { id: 'fx.appsTheme', module: 'effects', group: 'Тема', label: 'Тёмная тема приложений', type: 'toggle', default: false, post: 'theme',
    src: dword(PERS, 'AppsUseLightTheme', { on: 0, off: 1 }) },
  { id: 'fx.systemTheme', module: 'effects', group: 'Тема', label: 'Тёмная тема системы (панель задач, Пуск)', type: 'toggle', default: false, post: 'theme',
    src: dword(PERS, 'SystemUsesLightTheme', { on: 0, off: 1 }) },
  toggleReg('fx.transparency', 'effects', 'Эффекты', 'Эффекты прозрачности (Mica / Acrylic)', PERS, 'EnableTransparency', { default: true, post: 'theme' }),
  toggleReg('fx.accentSurfaces', 'effects', 'Эффекты', 'Акцентный цвет на Пуске и панели задач', PERS, 'ColorPrevalence', { default: false, post: 'theme' }),
  spiToggle('fx.fontSmoothing', 'effects', 'Эффекты', 'Сглаживание шрифтов', 0x4A, 0x4B),

  // ───────── Widgets ─────────
  toggleReg('widgets.button', 'widgets', 'Панель задач', 'Кнопка «Мини-приложения» (Windows 11)', ADV, 'TaskbarDa', { default: true, requires: 'win11', post: 'tray' }),
  toggleReg('widgets.chat', 'widgets', 'Панель задач', 'Кнопка «Чат» (Windows 11)', ADV, 'TaskbarMn', { default: true, requires: 'win11', post: 'tray' }),
  { id: 'widgets.feeds', module: 'widgets', group: 'Панель задач', label: 'Новости и интересы (Windows 10)', type: 'select', default: 0, requires: 'win10', post: 'explorer',
    options: [[0, 'Значок и текст'], [1, 'Только значок'], [2, 'Отключено']], src: dword(FEEDS, 'ShellFeedsTaskbarViewMode') },
];

// Taskbar-related OS values are applied by the Taskbar service (they share the same registry plumbing).
const taskbarRegistry = {
  centerIcons: { key: ADV, name: 'TaskbarAl', type: 'REG_DWORD' },
  iconSize11: { key: ADV, name: 'TaskbarSi', type: 'REG_DWORD' },
  iconSize10: { key: ADV, name: 'TaskbarSmallIcons', type: 'REG_DWORD' },
  taskView: { key: ADV, name: 'ShowTaskViewButton', type: 'REG_DWORD' },
  widgets: { key: ADV, name: 'TaskbarDa', type: 'REG_DWORD' },
  chat: { key: ADV, name: 'TaskbarMn', type: 'REG_DWORD' },
  search: { key: SRCH, name: 'SearchboxTaskbarMode', type: 'REG_DWORD' },
  stuckRects: { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3', name: 'Settings', type: 'REG_BINARY' },
};

module.exports = { defs, taskbarRegistry, CUR, ACC, DESK };
