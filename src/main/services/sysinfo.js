'use strict';
const os = require('os');
const system = require('./system');
const bridge = require('./ps-bridge');
const { isWin } = require('../core/platform');

let timers = [], users = 0, listener = () => {};
const state = { cpu: 0, ram: { used: 0, total: os.totalmem(), pct: 0 }, gpu: null, temp: { cpu: null, gpu: null }, net: { down: 0, up: 0 }, ts: 0 };
let prevCpu = null, prevNet = null;

function cpuTimes() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; } return { idle, total }; }
function sampleCpu() {
  const t = cpuTimes();
  if (prevCpu) { const dt = t.total - prevCpu.total, di = t.idle - prevCpu.idle; state.cpu = dt > 0 ? Math.round((1 - di / dt) * 100) : 0; }
  prevCpu = t;
  const total = os.totalmem(), free = os.freemem();
  state.ram = { used: total - free, total, pct: Math.round(((total - free) / total) * 100) };
  state.ts = Date.now(); listener(state);
}
async function sampleNet() {
  if (!isWin) { state.net = { down: Math.round(Math.random() * 1e5), up: Math.round(Math.random() * 2e4) }; return; }
  const r = await system.exec('netstat.exe', ['-e'], { timeout: 4000 });
  // locale independent: first line that consists of a label followed by two integers = "Bytes"
  const m = r.stdout.match(/^\D*?(\d{3,})\s+(\d{3,})\s*$/m);
  if (!m) return;
  const rx = Number(m[1]), tx = Number(m[2]), now = Date.now();
  if (prevNet) { const dt = (now - prevNet.t) / 1000; state.net = { down: Math.max(0, (rx - prevNet.rx) / dt), up: Math.max(0, (tx - prevNet.tx) / dt) }; }
  prevNet = { rx, tx, t: now };
}
async function sampleHeavy() {
  if (!isWin) return;
  try { const g = await bridge.call('gpu.get'); state.gpu = g.load; } catch { state.gpu = null; }
  try { state.temp = await bridge.call('temp.get'); } catch { state.temp = { cpu: null, gpu: null }; }
}
function subscribe(fn) {
  listener = fn || listener;
  if (users++ > 0) return;
  bridge.acquire();
  prevCpu = cpuTimes(); prevNet = null;
  timers = [setInterval(sampleCpu, 1000), setInterval(sampleNet, 2000), setInterval(sampleHeavy, 4000)];
  sampleNet(); setTimeout(sampleHeavy, 500);
}
function unsubscribe() {
  users = Math.max(0, users - 1);
  if (users === 0) { timers.forEach(clearInterval); timers = []; bridge.release(); }
}
module.exports = { state, subscribe, unsubscribe, setListener: (fn) => { listener = fn; } };
