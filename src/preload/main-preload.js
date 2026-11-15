'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const EVENTS = new Set(['state', 'toast', 'telemetry', 'log', 'progress', 'navigate', 'maximized']);
contextBridge.exposeInMainWorld('api', {
  invoke: (name, payload) => ipcRenderer.invoke('hub:invoke', name, payload),
  on(event, cb) {
    if (!EVENTS.has(event)) return () => {};
    const h = (_e, data) => cb(data);
    ipcRenderer.on(`hub:${event}`, h);
    return () => ipcRenderer.removeListener(`hub:${event}`, h);
  },
  platform: process.platform,
});
