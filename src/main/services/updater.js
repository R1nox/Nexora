'use strict';
// Self-update with rollback. Update source = JSON manifest at app.updateUrl:
//   { "version": "1.2.0", "notes": ["..."], "url": "https://.../Setup.exe", "sha256": "...", "size": 123 }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, net } = require('electron');
const { spawn } = require('child_process');
const { dirs } = require('../core/paths');
const { cmp } = require('./extensions');
const log = require('../core/logger').make('updater');
let bundled = ''; try { bundled = String(require('../update-config.json').updateUrl || ''); } catch {}
const feedUrl = (store) => (store.get('app.updateUrl') || '').trim() || bundled;

const pendingFile = () => path.join(dirs.root, 'update-pending.json');
let info = null, downloaded = null;

async function check(store) {
  const url = feedUrl(store);
  store.set('update.lastCheck', Date.now());
  if (!url) return { configured: false, available: false, current: app.getVersion() };
  if (!/^https:\/\//i.test(url)) throw new Error('Адрес сервера обновлений должен начинаться с https://');
  const res = await net.fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Сервер обновлений ответил HTTP ${res.status}`);
  const j = JSON.parse(await res.text());
  if (!/^\d+\.\d+\.\d+$/.test(j.version || '') || typeof j.url !== 'string' || !/^[0-9a-f]{64}$/i.test(j.sha256 || '')) throw new Error('Некорректный манифест обновления (нужны version, url, sha256)');
  const u = new URL(j.url, url); if (u.protocol !== 'https:') throw new Error('Установщик должен загружаться по https');
  info = { version: j.version, notes: Array.isArray(j.notes) ? j.notes.map(String).slice(0, 30) : [], url: u.href, sha256: j.sha256.toLowerCase(), size: Number(j.size) || 0 };
  return { configured: true, available: cmp(info.version, app.getVersion()) > 0, current: app.getVersion(), info };
}
async function download(onProgress) {
  if (!info) throw new Error('Сначала проверьте наличие обновлений');
  const dest = path.join(dirs.cache, `Setup-${info.version}.exe`);
  const res = await net.fetch(info.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!res.ok) throw new Error(`Загрузка: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || info.size || 0;
  const hash = crypto.createHash('sha256'); const out = fs.createWriteStream(dest);
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    hash.update(value); got += value.length;
    if (!out.write(value)) await new Promise((r) => out.once('drain', r));
    onProgress?.(total ? got / total : 0);
  }
  await new Promise((r) => out.end(r));
  if (hash.digest('hex') !== info.sha256) { fs.rmSync(dest, { force: true }); throw new Error('Контрольная сумма загруженного обновления не совпала – файл удалён'); }
  downloaded = dest; return { file: dest };
}
async function install({ snapshot, store, onStep }) {
  if (!downloaded || !fs.existsSync(downloaded)) throw new Error('Обновление не загружено');
  onStep?.('Сохраняю настройки и профили…');
  await snapshot?.('Перед обновлением приложения');
  store.flush();
  fs.copyFileSync(path.join(dirs.config, 'settings.json'), path.join(dirs.backups, `settings-before-${app.getVersion()}.json`));
  onStep?.('Создаю копию текущей версии для отката…');
  const installDir = path.dirname(process.execPath);
  const dest = path.join(dirs.rollback, 'app');
  fs.rmSync(dest, { recursive: true, force: true });
  await fs.promises.cp(installDir, dest, { recursive: true });
  fs.writeFileSync(path.join(dirs.rollback, 'meta.json'), JSON.stringify({ version: app.getVersion(), installDir, exe: process.execPath, at: Date.now() }));
  fs.writeFileSync(pendingFile(), JSON.stringify({ from: app.getVersion(), to: info.version, attempts: 0, t: Date.now() }));
  onStep?.('Запускаю установщик…');
  spawn(downloaded, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400);
}
function hasRollback() { try { return fs.existsSync(path.join(dirs.rollback, 'meta.json')) && fs.existsSync(path.join(dirs.rollback, 'app')); } catch { return false; } }
function rollbackMeta() { try { return JSON.parse(fs.readFileSync(path.join(dirs.rollback, 'meta.json'), 'utf8')); } catch { return null; } }
function rollback() {
  const meta = rollbackMeta(); if (!meta || !hasRollback()) throw new Error('Нет сохранённой предыдущей версии');
  const script = path.join(dirs.cache, 'rollback.cmd');
  const src = path.join(dirs.rollback, 'app');
  fs.writeFileSync(script, [
    '@echo off', 'timeout /t 3 /nobreak >nul',
    `robocopy "${src}" "${meta.installDir}" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS >nul`,
    `start "" "${meta.exe}"`, '',
  ].join('\r\n'));
  try { fs.rmSync(pendingFile(), { force: true }); } catch {}
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  setTimeout(() => app.quit(), 300);
}
// called on every start: detects a failed update and rolls back automatically after 3 unhealthy starts
function startup() {
  let p; try { p = JSON.parse(fs.readFileSync(pendingFile(), 'utf8')); } catch { return { state: 'none' }; }
  if (p.to !== app.getVersion()) {
    fs.rmSync(pendingFile(), { force: true });
    return { state: 'not-applied', from: p.from, to: p.to };
  }
  p.attempts = (p.attempts || 0) + 1;
  fs.writeFileSync(pendingFile(), JSON.stringify(p));
  if (p.attempts > 3 && hasRollback()) { log.error('new version failed to start 3 times – rolling back'); rollback(); return { state: 'rolling-back' }; }
  return { state: 'verifying', ...p };
}
function markHealthy() {
  try { if (fs.existsSync(pendingFile())) { fs.rmSync(pendingFile(), { force: true }); log.info('update verified healthy'); return true; } } catch {}
  return false;
}
module.exports = { feedUrl, check, download, install, rollback, hasRollback, rollbackMeta, startup, markHealthy, getInfo: () => info };
