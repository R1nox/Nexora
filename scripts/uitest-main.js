// Dev-only UI smoke test: launches the real app under xvfb, visits every page, saves screenshots, exercises the extension API.
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
const out = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
app.setPath('userData', process.env.UD || '/tmp/wch-ud');
require('../src/main/main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const main = () => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Windows Customization Hub' && !w.isDestroyed());
const run = (code) => main().webContents.executeJavaScript(code, true);
const shot = async (name) => { await sleep(900); const img = await main().webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); console.log('shot', name); };
app.whenReady().then(async () => {
  await sleep(3500);
  const w = main(); if (!w) { console.log('NO WINDOW'); app.exit(2); return; }
  w.setSize(+process.env.W||1280, 820); w.setPosition(0, 0);
  const errors = []; w.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errors.push(msg); });
  const pages = ['dashboard', 'taskbar', 'appearance', 'extensions', 'installed', 'profiles', 'settings'];
  for (const p of pages) { await run(`document.querySelectorAll('.nav a')[${pages.indexOf(p)}].click()`); await shot(p); }
  // API exercise
  const t = async (label, code) => { try { const r = await run(code); console.log('OK  ', label, typeof r === 'object' ? JSON.stringify(r).slice(0, 160) : r); return r; } catch (e) { console.log('FAIL', label, e.message); } };
  await t('ext.list', `window.api.invoke('ext.list').then(l=>l.map(e=>e.id+':'+e.installed+':'+e.compatible).join(','))`);
  await t('install island', `window.api.invoke('ext.install',{id:'dynamic-island'}).then(e=>e.id+' enabled='+e.enabled+' signed='+e.signed)`);
  await t('install clock', `window.api.invoke('ext.install',{id:'clock-widget'}).then(e=>e.id+' enabled='+e.enabled)`);
  await t('install dyn-taskbar', `window.api.invoke('ext.install',{id:'dynamic-taskbar'}).then(e=>e.id+' signed='+e.signed)`);
  await sleep(1500);
  console.log('ext windows open:', BrowserWindow.getAllWindows().filter((x) => /^wcx:/.test(x.webContents.getURL())).map((x) => x.webContents.getURL()).join(' | '));
  await t('set settings', `window.api.invoke('ext.setSettings',{id:'clock-widget',patch:{style:'analog',hour24:false,bogus:1}}).then(s=>JSON.stringify(s))`);
  await t('bad perm net', `window.api.invoke('ext.install',{id:'nope'}).catch(e=>'rejected: '+e.message)`);
  await t('profile apply glass', `window.api.invoke('profiles.apply',{id:'glass'}).then(r=>JSON.stringify(r))`);
  await t('snapshots', `window.api.invoke('backups.list').then(l=>l.length)`);
  await t('profile export/import sanitize', `window.api.invoke('profiles.list').then(r=>r.profiles.map(p=>p.id).join(','))`);
  await t('state', `window.api.invoke('app.state').then(s=>JSON.stringify({prof:s.activeProfile,ext:s.ext}))`);
  await run(`document.querySelectorAll('.nav a')[3].click()`); await shot('extensions-installed');
  await run(`document.querySelectorAll('.nav a')[1].click()`); await sleep(500); await run(`[...document.querySelectorAll('.mat')][4].click()`); await shot('taskbar-acrylic');
  await run(`document.querySelectorAll('.nav a')[5].click()`); await shot('profiles-after');
  await run(`document.querySelectorAll('.nav a')[0].click()`); await shot('dashboard-after');
  // open an extension window screenshot
  for (const x of BrowserWindow.getAllWindows()) { const u = x.webContents.getURL(); if (/^wcx:/.test(u)) { await sleep(800); const img = await x.webContents.capturePage(); fs.writeFileSync(path.join(out, 'ext-' + u.split('//')[1].replace(/[^a-z]/gi, '_') + '.png'), img.toPNG()); } }
  console.log('console errors:', JSON.stringify(errors.slice(0, 10)));
  app.exit(0);
});
