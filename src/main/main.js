'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme, ipcMain, dialog, shell, protocol, screen } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([{ scheme: 'wcx', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setAppUserModelId('com.windowscustomizationhub.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

const paths = require('./core/paths');
const plat = require('./core/platform');

let mainWindow = null, tray = null, store, taskbar, ext, config, logger, osSettings, registry;
let telemetryUsers = 0, winInfo = { display: '', ubr: '' };
const launchedHidden = process.argv.includes('--hidden');
const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
const icoPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');

// ─────────── helpers ───────────
const send = (ev, data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`hub:${ev}`, data); };
const toast = (t) => send('toast', t);
let stateTimer = null;
function emitState() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => { send('state', buildState()); rebuildTray(); }, 60);
}
function buildState() {
  const profiles = config.list();
  const ap = profiles.find((p) => p.id === store.get('activeProfile'));
  const exts = ext.list();
  const tb = store.get('taskbar');
  return {
    version: app.getVersion(), electron: process.versions.electron,
    os: { name: plat.name, build: plat.build, win11: plat.win11, isWin: plat.isWin, display: winInfo.display, mica: plat.mica },
    win32: { available: require('./core/win32').available, error: require('./core/win32').error },
    settings: store.get('app'), taskbar: tb, taskbarStatus: taskbar.status(),
    activeProfile: ap ? { id: ap.id, name: ap.name, dirty: !!ap && JSON.stringify(sanitize(ap.taskbar)) !== JSON.stringify(sanitize(tb)) } : { id: 'custom', name: 'Custom', dirty: false },
    ext: { installed: exts.filter((e) => e.installed).length, enabled: exts.filter((e) => e.enabled).length, updates: exts.filter((e) => e.updateAvailable).length, available: exts.length },
    rollbackAvailable: require('./services/updater').hasRollback(),
    uptime: process.uptime(),
  };
}
const sanitize = (t) => require('./services/config-service').sanitizeTaskbar(t);

async function readWinInfo() {
  if (!plat.isWin) { winInfo = { display: `${plat.name}`, ubr: '' }; return; }
  const k = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
  const dv = (await registry.get(k, 'DisplayVersion'))?.data || (await registry.get(k, 'ReleaseId'))?.data || '';
  const ubr = (await registry.get(k, 'UBR'))?.data;
  winInfo = { display: `${plat.name}${dv ? ' ' + dv : ''} · сборка ${plat.build}${ubr != null ? '.' + ubr : ''}`, ubr: ubr || '' };
}

// ─────────── window ───────────
function themeColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { dark, bg: dark ? '#0d0d14' : '#f3f4f9', symbol: dark ? '#ffffff' : '#1b1b25' };
}
function createWindow({ show = true } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) { if (show) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } return mainWindow; }
  const c = themeColors();
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 1000, minHeight: 660, show: false, title: 'Windows Customization Hub',
    icon: fs.existsSync(icoPath) ? icoPath : iconPath,
    backgroundColor: plat.mica ? '#00000000' : c.bg,
    ...(plat.mica ? { backgroundMaterial: 'mica' } : {}),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: c.symbol, height: 44 },
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'main-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  mainWindow.removeMenu?.();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.once('ready-to-show', () => { if (show) mainWindow.show(); });
  mainWindow.on('maximize', () => send('maximized', true));
  mainWindow.on('unmaximize', () => send('maximized', false));
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (telemetryOwner) { telemetryOwner = false; require('./services/sysinfo').unsubscribe(); }
    if (!store.get('app.closeToTray')) app.quit();
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { mica: plat.mica ? '1' : '0' } });
  return mainWindow;
}
function applyTheme() {
  const t = store.get('app.theme');
  nativeTheme.themeSource = t === 'light' ? 'light' : t === 'system' ? 'system' : 'dark';
  const c = themeColors();
  if (mainWindow && !mainWindow.isDestroyed()) { try { mainWindow.setTitleBarOverlay({ color: '#00000000', symbolColor: c.symbol, height: 44 }); mainWindow.setBackgroundColor(plat.mica ? '#00000000' : c.bg); } catch {} }
}

// ─────────── tray ───────────
function trayImage() {
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) return nativeImage.createEmpty();
  return img.resize({ width: 32, height: 32 });
}
function rebuildTray() {
  if (!tray) return;
  const tb = store.get('taskbar');
  const profiles = config.list(); const active = store.get('activeProfile');
  const panels = ext.panels();
  const extItems = ext.list().filter((e) => e.installed).map((e) => ({ label: e.name, type: 'checkbox', checked: e.enabled, click: (mi) => ext.setEnabled(e.id, mi.checked).catch((er) => toast({ kind: 'error', text: er.message })) }));
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть Windows Customization Hub', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Эффекты панели задач', type: 'checkbox', checked: !!tb.enabled, click: async (mi) => { const n = JSON.parse(JSON.stringify(store.get('taskbar'))); n.enabled = mi.checked; await taskbar.apply(n, { reason: 'tray' }); } },
    { label: 'Профили', submenu: profiles.map((p) => ({ label: p.name, type: 'radio', checked: p.id === active, click: () => config.apply(p.id).then((r) => toast({ kind: r.ok ? 'success' : 'warn', text: `Профиль «${p.name}» применён` })).catch((e) => toast({ kind: 'error', text: e.message })) })) },
    ...(panels.length ? [{ type: 'separator' }, ...panels.map((p) => ({ label: p.label, click: () => ext.togglePanel(p.id, p.wid) }))] : []),
    { label: 'Расширения', submenu: extItems.length ? extItems : [{ label: 'Нет установленных', enabled: false }] },
    { type: 'separator' },
    { label: 'Восстановить вид Windows', click: async () => { const r = await dialog.showMessageBox({ type: 'question', buttons: ['Восстановить', 'Отмена'], defaultId: 1, cancelId: 1, title: 'Восстановление', message: 'Вернуть стандартный вид Windows?', detail: 'Все изменения, сделанные приложением, будут отменены.' }); if (r.response === 0) { await config.restoreWindowsDefault(); toast({ kind: 'success', text: 'Стандартный вид Windows восстановлен' }); } } },
    { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}
function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('Windows Customization Hub');
  tray.on('click', () => createWindow());
  tray.on('double-click', () => createWindow());
  rebuildTray();
}

// ─────────── autostart ───────────
function applyAutostart() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!store.get('app.autostart'), path: process.execPath, args: ['--hidden'] });
}

// ─────────── IPC ───────────
let telemetryOwner = false;
const H = {};
const handle = (name, fn) => { H[name] = fn; };

function allowedSettingKey(k) {
  return ['theme', 'autostart', 'startMinimized', 'closeToTray', 'restoreOnExit', 'checkUpdates', 'updateUrl', 'repoUrl', 'developerMode'].includes(k);
}
function registerIpc() {
  const updater = require('./services/updater');
  const sysinfo = require('./services/sysinfo');
  const third = require('./services/thirdparty');
  const system = require('./services/system');
  const { PERMISSIONS } = require('./services/extensions');

  ipcMain.handle('hub:invoke', async (e, name, payload) => {
    if (!mainWindow || e.sender !== mainWindow.webContents) throw new Error('forbidden');
    const fn = H[name]; if (!fn) throw new Error(`unknown api ${name}`);
    try { return await fn(payload || {}); } catch (err) { logger.warn(`api ${name} failed: ${err.message}`); throw err; }
  });

  ipcMain.handle('ext:call', async (e, method, args) => {
    try { return await ext.call(e.sender.id, String(method), args && typeof args === 'object' ? args : {}); }
    catch (err) { logger.debug(`ext call ${method} failed: ${err.message}`); throw err; }
  });

  handle('app.state', () => buildState());
  handle('app.setSetting', ({ key, value }) => {
    if (!allowedSettingKey(key)) throw new Error('bad key');
    if (key === 'theme' && !['dark', 'light', 'system'].includes(value)) throw new Error('bad value');
    if (['updateUrl', 'repoUrl'].includes(key)) { value = String(value || '').trim().slice(0, 300); if (value && !/^https:\/\//i.test(value)) throw new Error('Допустим только адрес https://'); }
    else if (key !== 'theme') value = !!value;
    store.set(`app.${key}`, value);
    if (key === 'theme') applyTheme();
    if (key === 'autostart') applyAutostart();
    if (key === 'repoUrl') ext.refreshRemote().then(emitState);
    emitState(); return true;
  });
  handle('app.openPath', ({ which }) => { const p = { logs: paths.dirs.logs, config: paths.dirs.config, backups: paths.dirs.backups, extensions: paths.dirs.extensions }[which]; if (!p) throw new Error('bad'); return shell.openPath(p); });
  handle('app.openExternal', ({ url }) => { if (!/^https:\/\//i.test(url)) throw new Error('only https'); return shell.openExternal(url); });
  handle('app.restartExplorer', async () => { await system.restartExplorer(); return true; });
  handle('app.quit', () => { app.isQuitting = true; app.quit(); });
  handle('app.hideToTray', () => { mainWindow?.close(); });
  handle('app.window', ({ action }) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') (mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  });
  handle('app.resetAll', async () => {
    await config.restoreWindowsDefault();
    const fresh = require('./core/defaults').settings();
    store.replace({ ...fresh, app: { ...fresh.app, firstRun: false } });
    applyTheme(); applyAutostart(); emitState(); return true;
  });
  handle('logs.recent', ({ n }) => require('./core/logger').recent(Math.min(500, n || 100)));

  // taskbar
  handle('taskbar.get', async () => ({ config: store.get('taskbar'), os: await taskbar.readOs(), status: taskbar.status(), win11: plat.win11 }));
  handle('taskbar.apply', async ({ config: cfg }) => taskbar.apply(sanitize(cfg), { reason: 'manual' }));
  handle('taskbar.restoreDefaults', async () => config.restoreWindowsDefault());

  // appearance
  handle('appearance.describe', () => osSettings.describe());
  handle('appearance.read', async () => ({ values: await osSettings.readAll(), managed: store.get('appearance') }));
  handle('appearance.apply', async ({ values }) => {
    const clean = require('./services/config-service').sanitizeAppearance(values);
    await config.snapshot('Перед изменением оформления');
    const r = await osSettings.applyMany(clean);
    store.set('appearance', { ...store.get('appearance'), ...clean });
    emitState(); return r;
  });
  handle('appearance.reset', async ({ ids }) => {
    await config.snapshot('Перед сбросом оформления');
    const r = await osSettings.resetIds(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
    const m = { ...store.get('appearance') }; for (const id of ids || []) delete m[id]; store.set('appearance', m);
    return r;
  });
  handle('appearance.pickImage', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Выберите изображение', properties: ['openFile'], filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }] });
    return r.canceled ? null : r.filePaths[0];
  });

  // profiles
  handle('profiles.list', () => ({ profiles: config.list(), active: store.get('activeProfile') }));
  handle('profiles.apply', async ({ id }) => { const r = await config.apply(id); emitState(); return r; });
  handle('profiles.create', ({ name, description }) => { const p = config.createFromCurrent(String(name || 'Новый профиль').slice(0, 36), description); store.set('activeProfile', p.id); emitState(); return p; });
  handle('profiles.update', ({ id }) => { const p = config.updateFromCurrent(id); emitState(); return p; });
  handle('profiles.rename', ({ id, name }) => config.rename(id, String(name).slice(0, 36)));
  handle('profiles.duplicate', ({ id }) => config.duplicate(id));
  handle('profiles.remove', ({ id }) => { config.remove(id); emitState(); return true; });
  handle('profiles.export', async ({ id }) => {
    const p = config.get(id);
    const r = await dialog.showSaveDialog(mainWindow, { title: 'Экспорт профиля', defaultPath: `${(p?.name || 'profile').replace(/[^\w.-]+/g, '_')}.wchprofile`, filters: [{ name: 'Профиль Hub', extensions: ['wchprofile'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, config.exportProfile(id)); return r.filePath;
  });
  handle('profiles.import', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Импорт профиля', properties: ['openFile'], filters: [{ name: 'Профиль Hub', extensions: ['wchprofile', 'json'] }] });
    if (r.canceled) return null;
    const st = fs.statSync(r.filePaths[0]); if (st.size > 512 * 1024) throw new Error('Файл слишком большой');
    return config.importProfile(fs.readFileSync(r.filePaths[0], 'utf8'));
  });
  handle('profiles.restoreDefault', async () => { const r = await config.restoreWindowsDefault(); emitState(); return r; });

  // backups
  handle('backups.list', () => config.listSnapshots());
  handle('backups.create', async () => ({ id: await config.snapshot('Резервная копия вручную') }));
  handle('backups.restore', async ({ id }) => { const r = await config.restoreSnapshot(id); emitState(); return r; });

  // extensions
  handle('ext.list', () => ext.list());
  handle('ext.refresh', async () => { await ext.refreshRemote(); return { error: ext.remoteError, list: ext.list() }; });
  handle('ext.install', async ({ id }) => { const r = await ext.install(id); emitState(); return r; });
  handle('ext.uninstall', async ({ id, keepData }) => { await ext.uninstall(id, { keepData }); emitState(); return true; });
  handle('ext.setEnabled', async ({ id, on }) => { await ext.setEnabled(id, !!on); emitState(); return true; });
  handle('ext.setSettings', ({ id, patch }) => ext.setSettings(id, patch));
  handle('ext.setPermission', ({ id, perm, on }) => { ext.setPermission(id, perm, !!on); return true; });
  handle('ext.log', ({ id }) => ext.readLog(id));
  handle('ext.openPanel', ({ id, wid }) => { ext.togglePanel(id, wid); return true; });
  handle('ext.permissions', () => PERMISSIONS);
  handle('ext.pickApp', async ({ id }) => { if (!ext.has(id, 'apps.launch')) throw new Error('Нет разрешения'); return ext.pickApp(id); });
  handle('ext.installFile', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Выберите пакет расширения', properties: ['openFile'], filters: [{ name: 'Пакет расширения', extensions: ['wcx'] }] });
    if (r.canceled) return null;
    const m = await ext.installFromFile(r.filePaths[0]); emitState(); return m;
  });

  // third-party tools
  handle('third.scan', async () => { const apps = await third.scan(store.get('thirdparty.manual')); return { apps, conflicts: third.conflicts(apps, store.get('taskbar')) }; });
  handle('third.start', async ({ id }) => { const apps = await third.scan(store.get('thirdparty.manual')); const a = apps.find((x) => x.id === id); if (!a) throw new Error('not found'); await third.start(a); return true; });
  handle('third.stop', async ({ id }) => { const apps = await third.scan(store.get('thirdparty.manual')); const a = apps.find((x) => x.id === id); if (!a) throw new Error('not found'); await third.stop(a); return true; });
  handle('third.addManual', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Выберите программу', properties: ['openFile'], filters: [{ name: 'Программы', extensions: ['exe'] }] });
    if (r.canceled) return null;
    const p = r.filePaths[0]; const list = store.get('thirdparty.manual').slice();
    if (list.some((x) => x.path.toLowerCase() === p.toLowerCase())) throw new Error('Эта программа уже добавлена');
    list.push({ id: Date.now().toString(36), name: path.basename(p, '.exe'), path: p }); store.set('thirdparty.manual', list); return true;
  });
  handle('third.removeManual', ({ id }) => { store.set('thirdparty.manual', store.get('thirdparty.manual').filter((x) => 'manual:' + x.id !== id)); return true; });

  // updates
  handle('update.check', async () => updater.check(store));
  handle('update.download', async () => updater.download((p) => send('progress', { kind: 'update', value: p })));
  handle('update.install', async () => updater.install({ snapshot: (l) => config.snapshot(l), store, onStep: (t) => send('progress', { kind: 'update-step', text: t }) }));
  handle('update.rollback', () => { updater.rollback(); return true; });
  handle('update.info', () => ({ rollback: updater.hasRollback(), meta: updater.rollbackMeta(), version: app.getVersion() }));

  // telemetry for the dashboard
  handle('telemetry.start', () => { if (!telemetryOwner) { telemetryOwner = true; sysinfo.subscribe(); } return sysinfo.state; });
  handle('telemetry.stop', () => { if (telemetryOwner) { telemetryOwner = false; sysinfo.unsubscribe(); } return true; });
}
// ─────────── bootstrap ───────────
app.on('second-instance', () => createWindow());
app.on('window-all-closed', () => { /* keep running in the tray */ });

app.whenReady().then(async () => {
  paths.init();
  logger = require('./core/logger').make('main');
  require('./core/logger').prune();
  registry = require('./core/registry');
  osSettings = require('./services/os-settings');
  const { JsonStore } = require('./core/store');
  const defaults = require('./core/defaults');
  store = new JsonStore(path.join(paths.dirs.config, 'settings.json'), defaults.settings());
  logger.info(`Windows Customization Hub ${app.getVersion()} starting on ${plat.name} build ${plat.build} (win32 api: ${require('./core/win32').available})`);

  const updater = require('./services/updater');
  const upd = updater.startup();
  if (upd.state !== 'none') logger.info('update state', upd);

  const { TaskbarService } = require('./services/taskbar');
  const { Extensions } = require('./services/extensions');
  const { Config } = require('./services/config-service');
  let cfgRef = null;
  taskbar = new TaskbarService({ store, getDynamic: () => ext?.dynamicConfig(), snapshot: (l) => cfgRef?.snapshot(l), emit: () => emitState() });
  ext = new Extensions({ store, taskbar, emit: () => emitState(), toast });
  config = cfgRef = new Config({ store, taskbar, extensions: ext, emit: () => emitState() });
  require('./services/sysinfo').setListener((s) => { ext.broadcast('stats', s, 'system.stats'); if (telemetryOwner) send('telemetry', s); });
  require('./core/logger').onEntry((en) => { if (en.level !== 'DEBUG') send('log', en); });

  if (!config.get('custom')) config.saveUser({ id: 'custom', name: 'Custom', icon: '✦', description: 'Ваш личный профиль. Сохраняйте сюда текущие настройки.', taskbar: store.get('taskbar'), appearance: {}, extensions: { enable: [], disable: [] } });

  applyTheme();
  nativeTheme.on('updated', () => { applyTheme(); send('state', buildState()); });
  registerIpc();
  await readWinInfo();
  await ext.refreshRemote().catch(() => {});
  createTray();
  const hidden = launchedHidden || (store.get('app.startMinimized') && app.getLoginItemSettings().wasOpenedAtLogin);
  if (!hidden || store.get('app.firstRun')) createWindow({ show: true });
  store.set('app.firstRun', false);
  taskbar.start();
  ext.startAll();
  applyAutostart();
  if (upd.state === 'not-applied') toast({ kind: 'warn', text: `Обновление до ${upd.to} не было установлено` });
  setTimeout(() => updater.markHealthy(), 20000);
  if (store.get('app.checkUpdates') && updater.feedUrl(store)) setTimeout(() => updater.check(store).then((r) => { if (r.available) { toast({ kind: 'info', text: `Доступно обновление ${r.info.version}` }); } }).catch(() => {}), 8000);
});

app.on('before-quit', () => {
  try {
    if (ext) ext.closeAll();
    if (taskbar) { taskbar.stop(); if (store.get('app.restoreOnExit')) taskbar.clearEffects(); else require('./services/overlay').destroy(); }
    require('./services/ps-bridge').stop();
    store && store.flush();
  } catch (e) { console.error(e); }
});
process.on('uncaughtException', (e) => { try { logger?.error('uncaughtException', e); } catch {} });
process.on('unhandledRejection', (e) => { try { logger?.error('unhandledRejection', e); } catch {} });
