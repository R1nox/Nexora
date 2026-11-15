'use strict';
const { execFile, spawn } = require('child_process');
const { isWin } = require('../core/platform');

function exec(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: opts.timeout || 15000, maxBuffer: 8 * 1024 * 1024, encoding: opts.encoding || 'utf8' },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}
async function processes() {
  if (!isWin) return [];
  const r = await exec('tasklist.exe', ['/fo', 'csv', '/nh']);
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m) out.push({ name: m[1], pid: Number(m[2]) });
  }
  return out;
}
async function killByName(name) { return isWin ? exec('taskkill.exe', ['/f', '/im', name]) : { err: null }; }
async function restartExplorer() {
  if (!isWin) return false;
  await exec('taskkill.exe', ['/f', '/im', 'explorer.exe']);
  await new Promise((r) => setTimeout(r, 600));
  spawn('explorer.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return true;
}
function launch(file, args = []) {
  const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}
module.exports = { exec, processes, killByName, restartExplorer, launch };
