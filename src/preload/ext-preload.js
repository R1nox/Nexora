'use strict';
// Preload for sandboxed extension windows. It only forwards calls – the main process decides,
// per extension, whether each call is permitted by the manifest and the user's grants.
const { contextBridge, ipcRenderer } = require('electron');
const call = (method, args) => ipcRenderer.invoke('ext:call', method, args);
const listeners = new Map();
ipcRenderer.on('ext:event', (_e, name, data) => { for (const cb of listeners.get(name) || []) { try { cb(data); } catch (e) { console.error(e); } } });

contextBridge.exposeInMainWorld('hub', {
  apiVersion: 1,
  on(name, cb) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(cb); return () => listeners.get(name).delete(cb); },
  log: (level, msg) => call('log', { level, msg }),
  settings: { get: () => call('settings.get') },
  storage: { get: (key) => call('storage.get', { key }), set: (key, value) => call('storage.set', { key, value }), remove: (key) => call('storage.remove', { key }) },
  system: { info: () => call('system.info'), stats: () => call('system.stats') },
  audio: { get: () => call('audio.get'), set: (level) => call('audio.set', { level }), mute: (muted) => call('audio.mute', { muted }) },
  media: { get: () => call('media.get'), cmd: (action) => call('media.cmd', { action }) },
  notifications: { list: () => call('notifications.list'), push: (text, icon) => call('notify', { text, icon }) },
  net: { fetchJson: (url) => call('net.fetchJson', { url }) },
  window: { resize: (width, height, centerX) => call('window.resize', { width, height, centerX }), hide: () => call('window.hide') },
  apps: { list: () => call('apps.list'), launch: (id) => call('apps.launch', { id }), pick: () => call('apps.pick'), remove: (id) => call('apps.remove', { id }) },
  os: { toggles: () => call('os.toggles'), set: (id, value) => call('os.set', { id, value }) },
});
