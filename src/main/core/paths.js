'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// All user data lives in %APPDATA%\Windows Customization Hub – it is never touched by the installer,
// so settings, profiles and extensions survive updates (and uninstall unless the user asks otherwise).
function root() {
  return app.getPath('userData');
}
const dirs = {};
function init() {
  const r = root();
  Object.assign(dirs, {
    root: r,
    config: path.join(r, 'config'),
    profiles: path.join(r, 'profiles'),
    extensions: path.join(r, 'extensions'),
    extData: path.join(r, 'extdata'),
    backups: path.join(r, 'backups'),
    logs: path.join(r, 'logs'),
    cache: path.join(r, 'cache'),
    rollback: path.join(r, 'rollback'),
  });
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  return dirs;
}
// resources that ship inside the installed app
function resource(...p) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..', '..');
  return path.join(base, ...p);
}
module.exports = { dirs, init, resource };
