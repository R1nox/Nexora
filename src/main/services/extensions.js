'use strict';
// Extension manager: repository, signed packages, sandboxed runtime, permissions and lifecycle.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, session, protocol, screen, net, dialog, globalShortcut } = require('electron');
const AdmZip = require('adm-zip');
const { dirs, resource } = require('../core/paths');
const { extLogger } = require('../core/logger');
const log = require('../core/logger').make('extensions');
const plat = require('../core/platform');
const sysinfo = require('./sysinfo');
const bridge = require('./ps-bridge');
const osSettings = require('./os-settings');
const system = require('./system');

const API_VERSION = 1;
const CATEGORIES = ['Widgets', 'Taskbar', 'System', 'Media', 'Productivity', 'Utilities'];
// every capability an extension may request; signed-by-trusted-key extensions may get all of them,
// unsigned (developer mode) extensions only the harmless ones.
const PERMISSIONS = {
  storage: 'Хранить собственные данные',
  settings: 'Читать собственные настройки',
  notifications: 'Показывать уведомления приложения',
  'system.stats': 'Читать загрузку CPU, GPU, RAM, сети, температуру',
  'system.info': 'Читать версию Windows',
  'audio.read': 'Читать уровень громкости',
  'audio.control': 'Менять громкость и отключать звук',
  'media.read': 'Читать название и состояние воспроизводимой музыки',
  'media.control': 'Управлять воспроизведением (пауза, далее, назад)',
  network: 'Обращаться к серверам, указанным в манифесте',
  'apps.launch': 'Запускать приложения, выбранные вами',
  'system.settings': 'Переключать избранные настройки Windows',
  window: 'Менять размер собственного окна',
};
const SAFE_PERMS = new Set(['storage', 'settings', 'notifications', 'window', 'system.info']);
const HOST_MODULES = new Set(['dynamic-taskbar']);
const ALLOWED_EXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff2', '.woff', '.txt', '.md']);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.md': 'text/plain' };
const QUICK_OS = ['fx.appsTheme', 'fx.systemTheme', 'fx.transparency', 'desktop.hideIcons', 'desktop.hidden', 'desktop.fileExt', 'anim.minmax', 'window.accentTitle'];

// ── semver ──
const parse = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
function cmp(a, b) { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; }
function satisfies(v, range) {
  const m = String(range || '*').trim().match(/^(>=|>|<=|<|=|\^|~)?\s*(\d+(?:\.\d+){0,2})$/);
  if (!m) return range === '*' || !range;
  const op = m[1] || '=', r = m[2], c = cmp(v, r);
  if (op === '>=') return c >= 0; if (op === '>') return c > 0; if (op === '<=') return c <= 0; if (op === '<') return c < 0;
  if (op === '^') return c >= 0 && parse(v)[0] === parse(r)[0];
  if (op === '~') return c >= 0 && parse(v)[0] === parse(r)[0] && parse(v)[1] === parse(r)[1];
  return c === 0;
}
const safeRel = (p) => typeof p === 'string' && p.length < 200 && !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\') && !/^[a-zA-Z]:/.test(p) && !p.includes('\0');

function validateManifest(m) {
  const err = (t) => { throw new Error(`Манифест: ${t}`); };
  if (!m || typeof m !== 'object') err('не объект');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id || '')) err('некорректный id');
  if (typeof m.name !== 'string' || !m.name || m.name.length > 60) err('некорректное name');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) err('version должен быть вида 1.2.3');
  if (m.apiVersion !== API_VERSION) err(`apiVersion ${m.apiVersion} не поддерживается (нужен ${API_VERSION})`);
  if (typeof m.description !== 'string' || m.description.length > 400) err('некорректное description');
  if (!CATEGORIES.includes(m.category)) err('неизвестная category');
  m.permissions = Array.isArray(m.permissions) ? m.permissions : [];
  for (const p of m.permissions) if (!PERMISSIONS[p]) err(`неизвестное разрешение «${p}»`);
  m.windows = Array.isArray(m.windows) ? m.windows : [];
  if (m.windows.length > 4) err('слишком много окон');
  for (const w of m.windows) {
    if (!/^[a-z0-9-]{1,30}$/.test(w.id || '') || !safeRel(w.entry) || !/\.html$/.test(w.entry)) err('некорректное окно');
    w.width = Math.max(40, Math.min(1400, Number(w.width) || 300)); w.height = Math.max(24, Math.min(1000, Number(w.height) || 200));
  }
  m.settings = Array.isArray(m.settings) ? m.settings : [];
  for (const s of m.settings) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(s.key || '') || !['toggle', 'select', 'slider', 'text', 'color', 'hotkey', 'apps'].includes(s.type)) err(`некорректная настройка ${s.key}`);
  }
  m.network = Array.isArray(m.network) ? m.network.filter((h) => /^[a-z0-9.-]+$/i.test(h)).slice(0, 5) : [];
  m.dependencies = m.dependencies && typeof m.dependencies === 'object' ? m.dependencies : {};
  m.compat = m.compat || { windows: ['10', '11'], minBuild: 17763 };
  return m;
}

class Extensions {
  constructor({ store, taskbar, emit, toast }) {
    this.store = store; this.taskbar = taskbar; this.emit = emit || (() => {}); this.toast = toast || (() => {});
    this.windows = new Map();     // `${id}:${wid}` -> BrowserWindow
    this.senders = new Map();     // webContents.id -> extId
    this.sessions = new Set();
    this.restarts = new Map();
    this.logs = new Map();
    this.remoteIndex = null; this.remoteError = null;
    this.keys = this.loadKeys();
    this.hotkeys = new Map();
    this.notifs = [];
    this.statsUsers = 0;
    sysinfo.setListener((s) => this.broadcast('stats', s, 'system.stats'));
  }
  loadKeys() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'trusted-keys.json'), 'utf8')); } catch { log.error('trusted-keys.json missing – no package can be verified'); return []; }
  }
  get hubVersion() { return app.getVersion(); }
  logger(id) { if (!this.logs.has(id)) this.logs.set(id, extLogger(id)); return this.logs.get(id); }

  // ───────── repository ─────────
  bundledIndex() {
    try { return JSON.parse(fs.readFileSync(resource('repository', 'index.json'), 'utf8')); } catch (e) { log.error('bundled repository unreadable', e); return { extensions: [] }; }
  }
  async refreshRemote() {
    const url = (this.store.get('app.repoUrl') || '').trim();
    this.remoteIndex = null; this.remoteError = null;
    if (!url) return;
    try {
      if (!/^https:\/\//i.test(url)) throw new Error('Адрес репозитория должен начинаться с https://');
      const base = url.replace(/\/+$/, '');
      const res = await net.fetch(`${base}/index.json`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = JSON.parse(await res.text());
      if (j.format !== 'wch-repository' || !Array.isArray(j.extensions)) throw new Error('Неверный формат index.json');
      j.base = base; this.remoteIndex = j;
      try { fs.writeFileSync(path.join(dirs.cache, 'repo-index.json'), JSON.stringify(j)); } catch {}
    } catch (e) {
      this.remoteError = e.message; log.warn('remote repository failed', e.message);
      try { this.remoteIndex = JSON.parse(fs.readFileSync(path.join(dirs.cache, 'repo-index.json'), 'utf8')); } catch {}
    }
  }
  entries() {
    const map = new Map();
    for (const e of this.bundledIndex().extensions || []) map.set(e.id, { ...e, source: 'bundled' });
    if (this.remoteIndex) for (const e of this.remoteIndex.extensions || []) {
      const cur = map.get(e.id);
      if (!cur || cmp(e.version, cur.version) > 0) map.set(e.id, { ...e, source: 'remote', base: this.remoteIndex.base });
    }
    return [...map.values()];
  }

  // ───────── installed ─────────
  dirOf(id) { return path.join(dirs.extensions, id); }
  readInstalled(id) {
    try {
      const d = this.dirOf(id);
      const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')));
      const meta = JSON.parse(fs.readFileSync(path.join(d, '_install.json'), 'utf8'));
      return { manifest, meta, dir: d };
    } catch { return null; }
  }
  installedIds() { try { return fs.readdirSync(dirs.extensions).filter((n) => !n.includes('.') && this.readInstalled(n)); } catch { return []; } }
  enabledIds() { return this.installedIds().filter((id) => this.store.get(`ext.enabled.${id}`) === true); }
  isEnabled(id) { return this.store.get(`ext.enabled.${id}`) === true && !!this.readInstalled(id); }
  granted(id) {
    const inst = this.readInstalled(id); if (!inst) return [];
    const revoked = new Set(this.store.get(`ext.revoked.${id}`, []));
    return inst.manifest.permissions.filter((p) => (inst.meta.signed || SAFE_PERMS.has(p)) && !revoked.has(p));
  }
  has(id, perm) { return this.granted(id).includes(perm); }
  dataUri(file, mime) { try { return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; } catch { return null; } }

  // unified view for the UI
  list() {
    const entries = this.entries();
    const out = new Map();
    for (const e of entries) {
      out.set(e.id, {
        id: e.id, name: e.name, description: e.description, category: e.category, author: e.author || 'Unknown', version: e.version, size: e.size || 0,
        icon: e.icon || null, preview: e.preview || null, permissions: e.permissions || [], changelog: e.changelog || [], compat: e.compat || {}, dependencies: e.dependencies || {},
        signed: !!e.signature, installed: false, enabled: false, installedVersion: null, updateAvailable: false, source: e.source, compatible: this.checkCompat(e), incompatReason: this.incompat(e),
      });
    }
    for (const id of this.installedIds()) {
      const { manifest: m, meta, dir } = this.readInstalled(id);
      const base = out.get(id) || { id, name: m.name, description: m.description, category: m.category, author: m.author || 'Unknown', version: m.version, size: 0, permissions: m.permissions, changelog: [], compat: m.compat, dependencies: m.dependencies, source: 'local', compatible: true, signed: !!meta.signed };
      Object.assign(base, {
        installed: true, installedVersion: m.version, enabled: this.isEnabled(id), signed: !!meta.signed, sideloaded: meta.source === 'file', hostModule: m.hostModule || null,
        installedAt: meta.installedAt, settingsSchema: m.settings, settings: this.getSettings(id), grantedPermissions: this.granted(id), requestedPermissions: m.permissions, windows: m.windows.map((w) => ({ id: w.id, open: this.windows.has(`${id}:${w.id}`), panel: !!w.panel })),
        size: base.size || this.dirSize(dir),
      });
      base.icon = base.icon || this.dataUri(path.join(dir, 'icon.svg'), 'image/svg+xml');
      base.preview = base.preview || this.dataUri(path.join(dir, 'preview.svg'), 'image/svg+xml');
      base.updateAvailable = !!out.get(id) && cmp(out.get(id).version, m.version) > 0 && out.get(id).compatible;
      base.latestVersion = out.get(id)?.version || m.version;
      base.integrityOk = this.verifyIntegrity(id);
      out.set(id, base);
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  dirSize(d) { let n = 0; const walk = (p) => { for (const f of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, f.name); f.isDirectory() ? walk(q) : (n += fs.statSync(q).size); } }; try { walk(d); } catch {} return n; }
  checkCompat(e) { return !this.incompat(e); }
  incompat(e) {
    if (e.minHub && cmp(this.hubVersion, e.minHub) < 0) return `Требуется Hub ${e.minHub}+`;
    if (e.apiVersion && e.apiVersion !== API_VERSION) return 'Другая версия API расширений';
    const c = e.compat || {};
    if (plat.isWin) {
      if (Array.isArray(c.windows) && !c.windows.includes(plat.win11 ? '11' : '10')) return `Только Windows ${c.windows.join('/')}`;
      if (c.minBuild && plat.build < c.minBuild) return `Нужна сборка Windows ${c.minBuild}+`;
    }
    return null;
  }

  // ───────── install / update / remove ─────────
  verifySignature(entry, sha) {
    if (!entry.signature || !entry.keyId) return null;
    const key = this.keys.find((k) => k.id === entry.keyId); if (!key) return null;
    const msg = Buffer.from(`${entry.id}\n${entry.version}\n${sha}`);
    try { return crypto.verify(null, msg, crypto.createPublicKey(key.publicKeyPem), Buffer.from(entry.signature, 'base64')) ? key : null; } catch { return null; }
  }
  async fetchPackage(entry) {
    if (entry.source === 'remote') {
      const u = new URL(entry.package, entry.base + '/');
      if (u.protocol !== 'https:') throw new Error('Пакет должен загружаться по https');
      const res = await net.fetch(u.href, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`Загрузка пакета: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 60 * 1024 * 1024) throw new Error('Пакет слишком большой');
      return buf;
    }
    return fs.readFileSync(resource('repository', entry.package));
  }
  unpack(buf) {
    const zip = new AdmZip(buf); const files = new Map(); let total = 0;
    const entries = zip.getEntries();
    if (entries.length > 500) throw new Error('Слишком много файлов в пакете');
    for (const e of entries) {
      if (e.isDirectory) continue;
      const name = e.entryName.replace(/\\/g, '/');
      if (!safeRel(name)) throw new Error(`Небезопасный путь в пакете: ${name}`);
      if (((e.attr >>> 16) & 0o170000) === 0o120000) throw new Error('Символические ссылки запрещены');
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) throw new Error(`Файл «${name}» недопустим: расширения не могут содержать исполняемый код (${ext || 'без расширения'})`);
      const data = e.getData(); total += data.length;
      if (total > 60 * 1024 * 1024) throw new Error('Пакет слишком большой после распаковки');
      files.set(name, data);
    }
    return files;
  }
  async installEntry(entry, { fromFile = null, devMode = false } = {}) {
    const buf = fromFile ? fs.readFileSync(fromFile) : await this.fetchPackage(entry);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    let key = null;
    if (!fromFile) {
      if (sha !== entry.sha256) throw new Error('Контрольная сумма пакета не совпала – установка отменена');
      key = this.verifySignature(entry, sha);
      if (!key) throw new Error('Подпись пакета недействительна – установка отменена');
    }
    const files = this.unpack(buf);
    if (!files.has('manifest.json')) throw new Error('В пакете нет manifest.json');
    const manifest = validateManifest(JSON.parse(files.get('manifest.json').toString('utf8')));
    if (!fromFile && (manifest.id !== entry.id || manifest.version !== entry.version)) throw new Error('Манифест не соответствует записи репозитория');
    if (fromFile) {
      if (!devMode) throw new Error('Установка из файла требует включённого режима разработчика (Настройки → Для разработчиков)');
      const sidecar = fromFile.replace(/\.wcx$/i, '.sig.json');
      try {
        const sig = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
        key = this.verifySignature({ id: manifest.id, version: manifest.version, signature: sig.signature, keyId: sig.keyId }, sha);
      } catch { key = null; }
    }
    if (manifest.hostModule && !(key && HOST_MODULES.has(manifest.hostModule))) throw new Error('Расширение без доверенной подписи не может содержать модуль хоста');
    const inc = this.incompat(manifest); if (inc) throw new Error(`Несовместимо: ${inc}`);
    // dependencies
    for (const [dep, range] of Object.entries(manifest.dependencies)) {
      const di = this.readInstalled(dep);
      if (di && satisfies(di.manifest.version, range)) continue;
      const de = this.entries().find((e) => e.id === dep);
      if (!de || !satisfies(de.version, range)) throw new Error(`Не найдена зависимость ${dep} ${range}`);
      log.info(`installing dependency ${dep}`);
      await this.installEntry(de);
    }
    // write to temp then swap atomically (previous version kept until the new one is verified)
    const target = this.dirOf(manifest.id), tmp = target + '.tmp', old = target + '.old';
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(old, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const integrity = {};
    for (const [name, data] of files) {
      const dest = path.join(tmp, name);
      if (!path.resolve(dest).startsWith(path.resolve(tmp) + path.sep)) throw new Error('Небезопасный путь');
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data);
      integrity[name] = crypto.createHash('sha256').update(data).digest('hex');
    }
    fs.writeFileSync(path.join(tmp, '_integrity.json'), JSON.stringify(integrity));
    fs.writeFileSync(path.join(tmp, '_install.json'), JSON.stringify({ version: manifest.version, signed: !!key, keyId: key?.id || null, publisher: key?.name || null, sha256: sha, installedAt: Date.now(), source: fromFile ? 'file' : entry.source }));
    const wasEnabled = this.isEnabled(manifest.id);
    if (wasEnabled) this.closeWindows(manifest.id);
    if (fs.existsSync(target)) fs.renameSync(target, old);
    fs.renameSync(tmp, target);
    if (!this.readInstalled(manifest.id)) { fs.rmSync(target, { recursive: true, force: true }); if (fs.existsSync(old)) fs.renameSync(old, target); throw new Error('Установленный пакет не прошёл проверку, восстановлена предыдущая версия'); }
    fs.rmSync(old, { recursive: true, force: true });
    this.logger(manifest.id)('info', `installed v${manifest.version} (${key ? 'signed by ' + key.name : 'UNSIGNED'})`);
    if (wasEnabled) this.openWindows(manifest.id);
    this.emit();
    return manifest;
  }
  async install(id) {
    const entry = this.entries().find((e) => e.id === id);
    if (!entry) throw new Error('Расширение не найдено в репозитории');
    const inc = this.incompat(entry); if (inc) throw new Error(`Несовместимо: ${inc}`);
    const prev = this.readInstalled(id);
    await this.installEntry(entry);
    if (!prev) await this.setEnabled(id, true);   // freshly installed extensions are switched on
    return this.list().find((e) => e.id === id);
  }
  async installFromFile(file) {
    const m = await this.installEntry({}, { fromFile: file, devMode: this.store.get('app.developerMode') });
    await this.setEnabled(m.id, false);
    return m;
  }
  dependents(id) { return this.installedIds().filter((o) => o !== id && this.readInstalled(o).manifest.dependencies?.[id] !== undefined); }
  async uninstall(id, { keepData = false } = {}) {
    const deps = this.dependents(id);
    if (deps.length) throw new Error(`От расширения зависят: ${deps.join(', ')}. Сначала удалите их.`);
    await this.setEnabled(id, false);
    fs.rmSync(this.dirOf(id), { recursive: true, force: true });
    if (!keepData) { fs.rmSync(path.join(dirs.extData, `${id}.json`), { force: true }); this.store.set(`ext.settings.${id}`, undefined); this.store.set(`ext.revoked.${id}`, undefined); }
    this.store.set(`ext.enabled.${id}`, undefined);
    this.logger(id)('info', 'uninstalled');
    this.taskbar?.reschedule?.();
    this.emit();
  }
  verifyIntegrity(id) {
    const d = this.dirOf(id);
    try {
      const integ = JSON.parse(fs.readFileSync(path.join(d, '_integrity.json'), 'utf8'));
      for (const [name, h] of Object.entries(integ)) {
        if (crypto.createHash('sha256').update(fs.readFileSync(path.join(d, name))).digest('hex') !== h) return false;
      }
      return true;
    } catch { return false; }
  }

  // ───────── enable / settings ─────────
  async setEnabled(id, on) {
    const inst = this.readInstalled(id); if (!inst) throw new Error('Расширение не установлено');
    if (on) {
      if (!this.verifyIntegrity(id)) throw new Error('Файлы расширения изменены после установки. Переустановите его.');
      for (const [dep, range] of Object.entries(inst.manifest.dependencies)) {
        const di = this.readInstalled(dep);
        if (!di || !satisfies(di.manifest.version, range)) throw new Error(`Нужна зависимость ${dep} ${range}`);
        if (!this.isEnabled(dep)) await this.setEnabled(dep, true);
      }
      this.store.set(`ext.enabled.${id}`, true);
      this.openWindows(id);
    } else {
      this.store.set(`ext.enabled.${id}`, false);
      this.closeWindows(id);
      for (const o of this.dependents(id)) if (this.isEnabled(o)) await this.setEnabled(o, false);
    }
    this.registerHotkeys(id);
    this.taskbar?.reschedule?.();
    this.emit();
  }
  getSettings(id) {
    const inst = this.readInstalled(id); if (!inst) return {};
    const saved = this.store.get(`ext.settings.${id}`, {}) || {};
    const out = {};
    for (const s of inst.manifest.settings) out[s.key] = s.key in saved ? saved[s.key] : s.default;
    return out;
  }
  setSettings(id, patch) {
    const inst = this.readInstalled(id); if (!inst) throw new Error('Расширение не установлено');
    const cur = this.getSettings(id);
    for (const [k, v] of Object.entries(patch || {})) {
      const s = inst.manifest.settings.find((x) => x.key === k); if (!s) continue;
      if (s.type === 'toggle') cur[k] = !!v;
      else if (s.type === 'slider') cur[k] = Math.min(s.max ?? 100, Math.max(s.min ?? 0, Number(v) || 0));
      else if (s.type === 'select') cur[k] = (s.options || []).some((o) => o[0] === v) ? v : s.default;
      else if (s.type === 'color') cur[k] = /^#[0-9a-f]{6}$/i.test(v) ? v : s.default;
      else if (s.type === 'hotkey') cur[k] = /^[A-Za-z0-9+]{0,30}$/.test(v) ? v : s.default;
      else if (s.type === 'text') cur[k] = String(v).slice(0, 200);
      else if (s.type === 'apps' && Array.isArray(v)) cur[k] = v.filter((a) => a && typeof a.id === 'string').slice(0, 24);
    }
    this.store.set(`ext.settings.${id}`, cur);
    this.sendTo(id, 'settings', cur);
    if (inst.manifest.hostModule) this.taskbar?.reschedule?.();
    this.registerHotkeys(id);
    this.emit();
    return cur;
  }
  setPermission(id, perm, on) {
    const inst = this.readInstalled(id); if (!inst || !inst.manifest.permissions.includes(perm)) return;
    const rev = new Set(this.store.get(`ext.revoked.${id}`, []));
    on ? rev.delete(perm) : rev.add(perm);
    this.store.set(`ext.revoked.${id}`, [...rev]);
    if (this.isEnabled(id)) { this.closeWindows(id); this.openWindows(id); }  // new permission set -> fresh windows
    this.emit();
  }
  // host modules (first-party signed only) – consulted by the taskbar service
  dynamicConfig() {
    const id = 'dynamic-taskbar';
    if (!this.isEnabled(id)) return null;
    const inst = this.readInstalled(id); if (!inst?.meta.signed || inst.manifest.hostModule !== 'dynamic-taskbar') return null;
    const s = this.getSettings(id);
    return { maximized: s.maximizedEnabled, maximizedMode: s.maximizedMode, maximizedColor: s.maximizedColor, maximizedOpacity: s.maximizedOpacity,
      start: s.startEnabled, startMode: s.startMode, startColor: s.startColor, startOpacity: s.startOpacity, animate: s.animate };
  }

  // ───────── runtime ─────────
  setupSession(id) {
    const ses = session.fromPartition(`wcx-${id}`);
    if (this.sessions.has(id)) return ses;
    this.sessions.add(id);
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.protocol.handle('wcx', (req) => {
      try {
        const inst = this.readInstalled(id); if (!inst) return new Response('gone', { status: 404 });
        const u = new URL(req.url);
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        const file = path.resolve(inst.dir, rel);
        if (!file.startsWith(path.resolve(inst.dir) + path.sep) || rel.startsWith('_')) return new Response('forbidden', { status: 403 });
        const ext = path.extname(file).toLowerCase();
        if (!MIME[ext]) return new Response('unsupported', { status: 415 });
        return new Response(fs.readFileSync(file), { headers: {
          'content-type': MIME[ext],
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        } });
      } catch { return new Response('not found', { status: 404 }); }
    });
    return ses;
  }
  openWindows(id) {
    const inst = this.readInstalled(id); if (!inst) return;
    for (const w of inst.manifest.windows) if (w.showOnEnable !== false) this.openWindow(id, w.id);
    this.registerHotkeys(id);
  }
  placement(id, w) {
    const d = screen.getPrimaryDisplay().workArea;
    const saved = this.store.get(`ext.windowPos.${id}:${w.id}`);
    if (saved && w.draggable) return { x: saved.x, y: saved.y };
    const m = 16, pos = w.position || 'center';
    const x = pos.includes('left') ? d.x + m : pos.includes('right') ? d.x + d.width - w.width - m : d.x + Math.round((d.width - w.width) / 2);
    const y = pos.startsWith('top') ? d.y + (w.offsetY ?? m) : pos.startsWith('bottom') ? d.y + d.height - w.height - m : d.y + Math.round((d.height - w.height) / 2);
    return { x, y };
  }
  openWindow(id, wid) {
    const inst = this.readInstalled(id); if (!inst) return;
    const w = inst.manifest.windows.find((x) => x.id === wid); if (!w) return;
    const key = `${id}:${wid}`;
    const ex = this.windows.get(key);
    if (ex && !ex.isDestroyed()) { ex.show(); ex.focus(); return ex; }
    const ses = this.setupSession(id);
    const p = this.placement(id, w);
    const win = new BrowserWindow({
      ...p, width: w.width, height: w.height, show: false, frame: false, transparent: w.transparent !== false, backgroundColor: '#00000000',
      resizable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: !!w.alwaysOnTop, focusable: w.focusable !== false, fullscreenable: false, minimizable: false, maximizable: false,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, preload: path.join(__dirname, '..', '..', 'preload', 'ext-preload.js'), backgroundThrottling: true },
    });
    if (w.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
    if (w.clickThrough) win.setIgnoreMouseEvents(true, { forward: true });
    const wc = win.webContents;
    this.senders.set(wc.id, id);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.on('console-message', (_e, level, msg) => this.logger(id)(['debug', 'info', 'warn', 'error'][level] || 'info', msg));
    wc.on('render-process-gone', (_e, d) => {
      this.logger(id)('error', `renderer gone: ${d.reason}`);
      const n = (this.restarts.get(id) || []).filter((t) => Date.now() - t < 60000); n.push(Date.now()); this.restarts.set(id, n);
      this.windows.delete(key); this.senders.delete(wc.id);
      if (n.length > 3) { this.toast({ kind: 'error', text: `Расширение «${inst.manifest.name}» постоянно падает и отключено` }); this.setEnabled(id, false).catch(() => {}); }
      else setTimeout(() => this.isEnabled(id) && this.openWindow(id, wid), 800);
    });
    wc.on('unresponsive', () => this.logger(id)('warn', 'window unresponsive'));
    if (w.draggable) win.on('moved', () => { const [x, y] = win.getPosition(); this.store.set(`ext.windowPos.${id}:${wid}`, { x, y }); });
    if (w.panel) win.on('blur', () => { if (!win.isDestroyed() && !wc.isDevToolsOpened()) win.hide(); });
    win.on('closed', () => { this.windows.delete(key); this.senders.delete(wc.id); this.releaseResources(id); });
    this.acquireResources(id);
    win.once('ready-to-show', () => { if (!w.panel) win.showInactive(); });
    win.loadURL(`wcx://app/${w.entry}`).catch((e) => this.logger(id)('error', `load failed: ${e.message}`));
    this.windows.set(key, win);
    return win;
  }
  acquireResources(id) {
    if (this.has(id, 'system.stats')) sysinfo.subscribe(); 
    if (this.has(id, 'audio.read') || this.has(id, 'media.read')) bridge.acquire();
  }
  releaseResources(id) {
    if (this.has(id, 'system.stats')) sysinfo.unsubscribe();
    if (this.has(id, 'audio.read') || this.has(id, 'media.read')) bridge.release();
  }
  closeWindows(id) {
    for (const [k, w] of [...this.windows]) if (k.startsWith(id + ':')) { try { w.destroy(); } catch {} this.windows.delete(k); }
    this.unregisterHotkeys(id);
  }
  closeAll() { for (const id of this.installedIds()) this.closeWindows(id); globalShortcut.unregisterAll?.(); }
  togglePanel(id, wid) {
    const key = `${id}:${wid}`; const w = this.windows.get(key);
    if (w && !w.isDestroyed()) { if (w.isVisible()) w.hide(); else { this.position(w, id, wid); w.show(); w.focus(); } return; }
    const nw = this.openWindow(id, wid); nw?.once('ready-to-show', () => { this.position(nw, id, wid); nw.show(); nw.focus(); });
  }
  position(win, id, wid) {
    const inst = this.readInstalled(id); const w = inst?.manifest.windows.find((x) => x.id === wid); if (!w) return;
    const p = this.placement(id, { ...w, draggable: false }); win.setPosition(p.x, p.y);
  }
  panels() {
    const out = [];
    for (const id of this.enabledIds()) {
      const { manifest } = this.readInstalled(id);
      for (const w of manifest.windows) if (w.panel) out.push({ id, wid: w.id, label: w.title || manifest.name });
    }
    return out;
  }
  registerHotkeys(id) {
    this.unregisterHotkeys(id);
    const inst = this.readInstalled(id); if (!inst || !this.isEnabled(id)) return;
    const s = this.getSettings(id);
    for (const w of inst.manifest.windows.filter((x) => x.panel && x.hotkeySetting)) {
      const acc = (s[w.hotkeySetting] || '').trim(); if (!acc) continue;
      const accel = acc.replace(/\bWin\b/i, 'Super');
      try { if (globalShortcut.register(accel, () => this.togglePanel(id, w.id))) this.hotkeys.set(`${id}:${w.id}`, accel); } catch (e) { this.logger(id)('warn', `hotkey ${acc} rejected: ${e.message}`); }
    }
  }
  unregisterHotkeys(id) { for (const [k, acc] of [...this.hotkeys]) if (k.startsWith(id + ':')) { try { globalShortcut.unregister(acc); } catch {} this.hotkeys.delete(k); } }
  sendTo(id, event, data) { for (const [k, w] of this.windows) if (k.startsWith(id + ':') && !w.isDestroyed()) w.webContents.send('ext:event', event, data); }
  broadcast(event, data, perm) {
    for (const [k, w] of this.windows) {
      if (w.isDestroyed()) continue;
      const id = k.split(':')[0];
      if (!perm || this.has(id, perm)) w.webContents.send('ext:event', event, data);
    }
  }
  pushNotification(n) {
    const item = { id: Date.now() + Math.random(), t: Date.now(), ...n };
    this.notifs.push(item); if (this.notifs.length > 30) this.notifs.shift();
    this.broadcast('notification', item, 'notifications');
  }

  // ───────── API exposed to sandboxed extension windows ─────────
  async call(senderId, method, args = {}) {
    const id = this.senders.get(senderId);
    if (!id) throw new Error('unknown caller');
    const need = (p) => { if (!this.has(id, p)) throw new Error(`Нет разрешения «${p}»`); };
    const log_ = this.logger(id);
    switch (method) {
      case 'log': log_(['debug', 'info', 'warn', 'error'].includes(args.level) ? args.level : 'info', String(args.msg).slice(0, 1500)); return true;
      case 'settings.get': need('settings'); return this.getSettings(id);
      case 'storage.get': need('storage'); return this.readData(id)[String(args.key)] ?? null;
      case 'storage.set': { need('storage'); const d = this.readData(id); d[String(args.key).slice(0, 80)] = args.value; this.writeData(id, d); return true; }
      case 'storage.remove': { need('storage'); const d = this.readData(id); delete d[String(args.key)]; this.writeData(id, d); return true; }
      case 'system.info': need('system.info'); return { os: plat.name, build: plat.build, win11: plat.win11, hub: this.hubVersion, locale: app.getLocale() };
      case 'system.stats': need('system.stats'); return sysinfo.state;
      case 'audio.get': need('audio.read'); return bridge.call('volume.get');
      case 'audio.set': need('audio.control'); return bridge.call('volume.set', { level: Math.max(0, Math.min(100, Number(args.level) || 0)) });
      case 'audio.mute': need('audio.control'); return bridge.call('volume.mute', { muted: !!args.muted });
      case 'media.get': need('media.read'); return bridge.call('media.get');
      case 'media.cmd': need('media.control'); if (!['toggle', 'play', 'pause', 'next', 'prev'].includes(args.action)) throw new Error('bad action'); return bridge.call('media.cmd', { action: args.action });
      case 'notifications.list': need('notifications'); return this.notifs.slice(-10);
      case 'notify': need('notifications'); this.pushNotification({ source: this.readInstalled(id).manifest.name, text: String(args.text || '').slice(0, 140), icon: String(args.icon || '').slice(0, 4) }); return true;
      case 'net.fetchJson': return this.netFetch(id, args.url);
      case 'window.resize': {
        need('window'); const w = [...this.windows].find(([, win]) => !win.isDestroyed() && win.webContents.id === senderId)?.[1]; if (!w) return false;
        const [cx, cy] = w.getPosition(); const [cw] = w.getSize();
        const nw = Math.max(40, Math.min(1400, Math.round(args.width || cw))), nh = Math.max(24, Math.min(1000, Math.round(args.height || 40)));
        if (args.centerX) w.setBounds({ x: cx + Math.round((cw - nw) / 2), y: cy, width: nw, height: nh }, true); else w.setSize(nw, nh, true);
        return true;
      }
      case 'window.hide': { const w = BrowserWindow.fromWebContents(require('electron').webContents.fromId(senderId)); w?.hide(); return true; }
      case 'apps.list': {
        need('apps.launch'); const out = [];
        for (const a of this.getSettings(id).apps || []) {
          let icon = null; try { icon = (await app.getFileIcon(a.path, { size: 'large' })).toDataURL(); } catch {}
          out.push({ id: a.id, name: a.name, icon });
        }
        return out;
      }
      case 'apps.launch': {
        need('apps.launch');
        const a = (this.getSettings(id).apps || []).find((x) => x.id === args.id); if (!a) throw new Error('Приложение не найдено');
        if (!fs.existsSync(a.path)) throw new Error('Файл не найден');
        if (/\.lnk$/i.test(a.path) || /\.(exe|bat|cmd)$/i.test(a.path)) system.launch('explorer.exe', [a.path]);  // opened by the shell, like a double-click
        else throw new Error('Допустимы только .exe, .lnk, .bat, .cmd');
        return true;
      }
      case 'apps.pick': need('apps.launch'); return this.pickApp(id);
      case 'apps.remove': { need('apps.launch'); const s = this.getSettings(id); this.setSettings(id, { apps: (s.apps || []).filter((a) => a.id !== args.id) }); return true; }
      case 'os.toggles': {
        need('system.settings');
        const vals = await osSettings.readAll(); const out = [];
        for (const k of QUICK_OS) { const d = osSettings.byId.get(k); if (d) out.push({ id: k, label: d.label, value: !!vals[k], supported: osSettings.supported(d) }); }
        const tb = this.store.get('taskbar');
        out.push({ id: 'taskbar.effects', label: 'Эффекты панели задач', value: !!tb.enabled, supported: true });
        out.push({ id: 'taskbar.autoHide', label: 'Автоскрытие панели задач', value: !!tb.autoHide, supported: true });
        return out;
      }
      case 'os.set': {
        need('system.settings');
        if (args.id === 'taskbar.effects' || args.id === 'taskbar.autoHide') {
          const tb = JSON.parse(JSON.stringify(this.store.get('taskbar')));
          if (args.id === 'taskbar.effects') tb.enabled = !!args.value; else tb.autoHide = !!args.value;
          const r = await this.taskbar.apply(tb, { reason: 'quick settings' }); return r.ok;
        }
        if (!QUICK_OS.includes(args.id)) throw new Error('Эта настройка недоступна');
        const r = await osSettings.applyMany({ [args.id]: !!args.value }); return r.errors.length === 0;
      }
      default: throw new Error(`Неизвестный метод ${method}`);
    }
  }
  async pickApp(id) {
    const r = await dialog.showOpenDialog({ title: 'Выберите приложение', properties: ['openFile'], filters: [{ name: 'Приложения и ярлыки', extensions: ['exe', 'lnk', 'bat', 'cmd'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const s = this.getSettings(id); const apps = Array.isArray(s.apps) ? s.apps.slice() : [];
    const entry = { id: crypto.randomBytes(5).toString('hex'), name: path.basename(p).replace(/\.[^.]+$/, ''), path: p };
    apps.push(entry); this.setSettings(id, { apps });
    return { id: entry.id, name: entry.name };
  }
  async netFetch(id, urlStr) {
    if (!this.has(id, 'network')) throw new Error('Нет разрешения «network»');
    const hosts = this.readInstalled(id).manifest.network;
    let u; try { u = new URL(urlStr); } catch { throw new Error('Некорректный URL'); }
    if (u.protocol !== 'https:' || !hosts.includes(u.hostname)) throw new Error(`Хост ${u.hostname} не разрешён манифестом`);
    const res = await net.fetch(u.href, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text(); if (text.length > 512 * 1024) throw new Error('Ответ слишком большой');
    return JSON.parse(text);
  }
  readData(id) { try { return JSON.parse(fs.readFileSync(path.join(dirs.extData, `${id}.json`), 'utf8')); } catch { return {}; } }
  writeData(id, d) {
    const s = JSON.stringify(d); if (s.length > 256 * 1024) throw new Error('Превышен лимит хранилища (256 КБ)');
    fs.writeFileSync(path.join(dirs.extData, `${id}.json`), s);
  }
  readLog(id, lines = 200) {
    const f = path.join(dirs.logs, `ext-${id.replace(/[^a-z0-9._-]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.log`);
    try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-lines); } catch { return []; }
  }
  startAll() { for (const id of this.enabledIds()) { try { this.openWindows(id); } catch (e) { log.error(`start ${id} failed`, e); } } }
}
module.exports = { Extensions, PERMISSIONS, API_VERSION, validateManifest, cmp, satisfies };
