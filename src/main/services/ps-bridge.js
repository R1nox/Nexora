'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { dirs } = require('../core/paths');
const { isWin } = require('../core/platform');
const log = require('../core/logger').make('ps-bridge');

let proc = null, buf = '', seq = 0, users = 0, idleTimer = null;
const pending = new Map();

function start() {
  if (proc || !isWin) return;
  const script = path.join(dirs.cache, 'bridge.ps1');
  fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'bridge.ps1'), 'utf8'), 'utf8'); // asar-safe copy
  proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); m.ok ? p.res(m.data) : p.rej(new Error(m.error)); } } catch { /* non-JSON noise */ }
    }
  });
  proc.stderr.on('data', (d) => log.warn('stderr', String(d).slice(0, 300)));
  proc.on('exit', (code) => { log.info('bridge exited', code); proc = null; for (const p of pending.values()) p.rej(new Error('bridge closed')); pending.clear(); });
  proc.on('error', (e) => { log.error('bridge spawn failed', e); proc = null; });
  log.info('bridge started');
}
function call(cmd, args = {}, timeout = 12000) {
  if (!isWin) return Promise.reject(new Error('Доступно только в Windows'));
  start();
  if (!proc) return Promise.reject(new Error('Не удалось запустить PowerShell'));
  return new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => { pending.delete(id); rej(new Error('Таймаут ответа')); }, timeout);
    pending.set(id, { res, rej, t });
    proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
  });
}
// consumers acquire/release so the helper process is only alive while something needs it
function acquire() { users++; clearTimeout(idleTimer); }
function release() { users = Math.max(0, users - 1); if (!users) { clearTimeout(idleTimer); idleTimer = setTimeout(stop, 30000); } }
function stop() { if (proc) { try { proc.stdin.end(); proc.kill(); } catch {} proc = null; } }
module.exports = { call, acquire, release, stop };
