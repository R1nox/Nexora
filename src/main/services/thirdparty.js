'use strict';
const fs = require('fs');
const path = require('path');
const system = require('./system');
const { isWin } = require('../core/platform');
const log = require('../core/logger').make('thirdparty');

const env = (k) => process.env[k] || '';
const PF = [env('ProgramFiles'), env('ProgramFiles(x86)')].filter(Boolean);
const LA = env('LOCALAPPDATA'), AD = env('APPDATA');

// What each known tool modifies – used for conflict detection. We NEVER edit their files or settings.
const KNOWN = [
  { id: 'translucenttb', name: 'TranslucentTB', appx: 'TranslucentTB', procs: ['TranslucentTB.exe'], exe: [path.join(LA, 'Microsoft', 'WindowsApps', 'TranslucentTB.exe'), ...PF.map((p) => path.join(p, 'TranslucentTB', 'TranslucentTB.exe'))], modifies: ['taskbar'], url: 'https://github.com/TranslucentTB/TranslucentTB', note: 'Прозрачность панели задач' },
  { id: 'windhawk', name: 'Windhawk', procs: ['windhawk.exe'], exe: PF.map((p) => path.join(p, 'Windhawk', 'windhawk.exe')), modifies: ['taskbar', 'explorer'], url: 'https://windhawk.net', note: 'Моды для Проводника и панели задач' },
  { id: 'roundedtb', name: 'RoundedTB', appx: 'RoundedTB', procs: ['RoundedTB.exe'], exe: [path.join(LA, 'Microsoft', 'WindowsApps', 'RoundedTB.exe'), ...PF.map((p) => path.join(p, 'RoundedTB', 'RoundedTB.exe'))], modifies: ['taskbar'], url: 'https://github.com/torchgm/RoundedTB', note: 'Скругление и отступы панели задач' },
  { id: 'explorerpatcher', name: 'ExplorerPatcher', procs: [], exe: [], dirs: [path.join(AD, 'ExplorerPatcher')], files: [path.join(env('SystemRoot') || 'C:\\Windows', 'dxgi.dll')], modifies: ['taskbar', 'start', 'explorer'], url: 'https://github.com/valinet/ExplorerPatcher', note: 'Внедряется в Проводник (нет отдельного процесса)', noProcess: true },
  { id: 'rainmeter', name: 'Rainmeter', procs: ['Rainmeter.exe'], exe: PF.map((p) => path.join(p, 'Rainmeter', 'Rainmeter.exe')), modifies: ['desktop'], url: 'https://www.rainmeter.net', note: 'Скины рабочего стола', stopArgs: ['!Quit'] },
  { id: 'startallback', name: 'StartAllBack', procs: ['StartAllBackX64.exe', 'StartAllBackCfg.exe'], exe: PF.map((p) => path.join(p, 'StartAllBack', 'StartAllBackCfg.exe')), modifies: ['taskbar', 'start', 'explorer'], url: 'https://www.startallback.com', note: 'Панель задач и меню «Пуск»' },
  { id: 'start11', name: 'Start11', procs: ['Start11Svr.exe', 'Start11_64.exe'], exe: PF.map((p) => path.join(p, 'Stardock', 'Start11', 'Start11Config.exe')), modifies: ['taskbar', 'start'], url: 'https://www.stardock.com/products/start11/', note: 'Меню «Пуск» и панель задач' },
  { id: 'lively', name: 'Lively Wallpaper', procs: ['Lively.exe'], exe: [path.join(LA, 'Programs', 'Lively Wallpaper', 'Lively.exe')], modifies: ['desktop'], url: 'https://rocksdanister.github.io/lively/', note: 'Живые обои' },
  { id: 'wallpaperengine', name: 'Wallpaper Engine', procs: ['wallpaper64.exe', 'wallpaper32.exe'], exe: [], modifies: ['desktop'], url: 'https://www.wallpaperengine.io', note: 'Живые обои (Steam)' },
];

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

const psEncode = (s) => Buffer.from(s, 'utf16le').toString('base64');
async function appxAndVersions(appxNames, files) {
  if (!isWin) return { appx: [], versions: {} };
  const script = `
$ErrorActionPreference='SilentlyContinue'
$cfg = $env:WCH_REQ | ConvertFrom-Json
$out = @{ appx = @(); versions = @{} }
foreach ($n in $cfg.appx) {
  $p = Get-AppxPackage -Name "*$n*" | Select-Object -First 1
  if ($p) { $id = (Get-AppxPackageManifest $p).Package.Applications.Application.Id | Select-Object -First 1
    $out.appx += @{ key = $n; version = $p.Version.ToString(); pfn = $p.PackageFamilyName; appId = $id } }
}
foreach ($f in $cfg.files) { $v = (Get-Item -LiteralPath $f).VersionInfo; if ($v) { $out.versions[$f] = if ($v.ProductVersion) { $v.ProductVersion } else { $v.FileVersion } } }
$out | ConvertTo-Json -Compress -Depth 5`;
  const r = await new Promise((resolve) => {
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncode(script)],
      { windowsHide: true, timeout: 20000, env: { ...process.env, WCH_REQ: JSON.stringify({ appx: appxNames, files }) } },
      (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
  });
  try { const j = JSON.parse(r.stdout.trim()); return { appx: [].concat(j.appx || []), versions: j.versions || {} }; } catch { return { appx: [], versions: {} }; }
}

async function scan(manualList = []) {
  const procs = await system.processes();
  const running = (names) => procs.filter((p) => names.some((n) => n.toLowerCase() === p.name.toLowerCase()));
  const all = [...KNOWN, ...manualList.map((m) => ({ id: 'manual:' + m.id, name: m.name, procs: [path.basename(m.path)], exe: [m.path], modifies: [], manual: true, url: '' }))];
  const found = all.map((k) => {
    const exe = (k.exe || []).find(exists) || null;
    const dirHit = (k.dirs || []).some(exists);
    const fileHit = (k.files || []).length ? (k.files || []).every(exists) : true;
    const procHit = running(k.procs || []);
    const installed = !!exe || (k.noProcess ? dirHit && fileHit : false) || procHit.length > 0;
    return { ...k, exePath: exe, installed, pids: procHit.map((p) => p.pid), running: k.noProcess ? installed && dirHit : procHit.length > 0 };
  });
  const appxNames = found.filter((f) => f.appx && !f.exePath).map((f) => f.appx);
  const files = found.filter((f) => f.exePath).map((f) => f.exePath);
  const extra = appxNames.length || files.length ? await appxAndVersions(appxNames, files) : { appx: [], versions: {} };
  const res = found.map((f) => {
    let version = f.exePath ? extra.versions[f.exePath] || null : null;
    let launch = f.exePath ? { type: 'exe', path: f.exePath } : null;
    const ax = extra.appx.find((a) => a.key === f.appx);
    if (ax) { version = ax.version; f.installed = true; launch = { type: 'appx', target: `shell:AppsFolder\\${ax.pfn}!${ax.appId || 'App'}` }; }
    return {
      id: f.id, name: f.name, installed: f.installed, running: f.running, version, path: f.exePath, modifies: f.modifies || [], note: f.note || '', url: f.url, manual: !!f.manual,
      canStart: !!launch && !f.noProcess, canStop: !f.noProcess && f.running, noProcess: !!f.noProcess, launch, procs: f.procs, stopArgs: f.stopArgs || null,
    };
  });
  return res;
}

async function start(app) {
  if (!app.launch) throw new Error('Программа не найдена');
  if (app.launch.type === 'appx') system.launch('explorer.exe', [app.launch.target]); else system.launch(app.launch.path);
}
async function stop(app) {
  if (app.stopArgs && app.path) {
    // official command-line interface (Rainmeter: !Quit)
    const r = await system.exec(app.path, app.stopArgs, { timeout: 8000 });
    if (!r.err) return;
  }
  for (const p of app.procs || []) await system.killByName(p);
}

// Conflict detection: two tools modifying the same Windows area at the same time
function conflicts(apps, taskbarCfg) {
  const out = [];
  const active = apps.filter((a) => a.installed && a.running);
  const ourTaskbar = taskbarCfg.enabled && (taskbarCfg.mode !== 'normal' || taskbarCfg.floating.enabled);
  for (const a of active) {
    if (ourTaskbar && a.modifies.includes('taskbar')) {
      out.push({ id: `tb-${a.id}`, severity: 'warn', app: a.id, title: `${a.name} тоже изменяет панель задач`,
        text: `${a.name} (${a.note.toLowerCase()}) работает одновременно с эффектами панели задач этого приложения. Оба будут перезаписывать прозрачность/форму каждую секунду — возможны мерцание и некорректный вид.`,
        actions: [a.canStop ? { type: 'stopApp', label: `Остановить ${a.name}` } : null, { type: 'disableTaskbarFx', label: 'Отключить эффекты панели здесь' }].filter(Boolean) });
    }
  }
  const tb = active.filter((a) => a.modifies.includes('taskbar'));
  if (tb.length > 1) {
    out.push({ id: 'tb-multi', severity: 'warn', title: 'Несколько программ управляют панелью задач', text: `Одновременно запущено: ${tb.map((a) => a.name).join(', ')}. Оставьте одну.`, actions: [] });
  }
  const start = active.filter((a) => a.modifies.includes('start'));
  if (start.length > 1) out.push({ id: 'start-multi', severity: 'warn', title: 'Несколько программ изменяют меню «Пуск»', text: `Запущено: ${start.map((a) => a.name).join(', ')}.`, actions: [] });
  return out;
}
module.exports = { scan, start, stop, conflicts, KNOWN };
