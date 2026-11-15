'use strict';
const os = require('os');
const isWin = process.platform === 'win32';
const [major, minor, build] = os.release().split('.').map((n) => parseInt(n, 10) || 0);
const win11 = (isWin && build >= 22000) || (!isWin && process.env.WCH_FAKE_WIN11 === '1'); // env override is for UI development off-Windows only
module.exports = {
  isWin, major, minor, build, win11, win10: isWin && !win11,
  name: !isWin ? `${os.type()} (dev mode – Windows API disabled)` : win11 ? 'Windows 11' : 'Windows 10',
  // Windows 11 22H2+ (build 22621) supports Mica backdrop on app windows
  mica: isWin && build >= 22621,
  versionString: os.release(),
};
