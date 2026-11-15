'use strict';
// Click-through decorative layer above the real taskbar: gradient tint, glow line and shadow.
// The native taskbar cannot draw these itself, so this is the safe alternative "panel over the desktop".
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { resource } = require('../core/paths');

let win = null;
let lastKey = '';
const PAD = 48; // extra space on the inner side of the screen for shadow

function ensure() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    width: 200, height: 100, show: false, frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, fullscreenable: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '..', '..', 'preload', 'overlay-preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: false });
  win.setVisibleOnAllWorkspaces?.(true);
  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'overlay.html'));
  win.on('closed', () => { win = null; });
  return win;
}

// rect: physical-pixel taskbar rect; edge: bottom|top|left|right; cfg: taskbar config
function update(cfg, rect, edge, scale) {
  const o = cfg.overlay;
  if (!o.enabled || !rect || !(o.gradient.enabled || o.glow.enabled || o.shadow.enabled)) return hide();
  const w = ensure();
  let d;
  try { d = screen.screenToDipRect ? screen.screenToDipRect(null, { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }) : null; } catch { d = null; }
  if (!d) d = { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
  const f = cfg.floating.enabled ? cfg.floating : { marginX: 0, insetTop: 0, insetBottom: 0, radius: 0 };
  // window bounds: taskbar rect extended inward by PAD
  const b = { x: d.x, y: d.y, width: d.width, height: d.height };
  if (edge === 'bottom') { b.y -= PAD; b.height += PAD; }
  else if (edge === 'top') { b.height += PAD; }
  else if (edge === 'left') { b.width += PAD; }
  else if (edge === 'right') { b.x -= PAD; b.width += PAD; }
  const info = {
    edge, pad: PAD, taskbar: { w: d.width, h: d.height },
    inset: { x: f.marginX || 0, top: f.insetTop || 0, bottom: f.insetBottom || 0 }, radius: f.radius || 0,
    overlay: o,
  };
  const key = JSON.stringify([b, info]);
  if (key === lastKey && w.isVisible()) return;
  lastKey = key;
  w.setBounds(b);
  const send = () => w.webContents.send('overlay:update', info);
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  if (!w.isVisible()) w.showInactive();
}
function hide() {
  lastKey = '';
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
}
function destroy() { if (win && !win.isDestroyed()) win.destroy(); win = null; lastKey = ''; }
module.exports = { update, hide, destroy };
