'use strict';
const taskbarDefaults = () => ({
  enabled: false,                 // nothing is changed until the user presses Apply
  mode: 'normal',                 // normal | clear | blur | glass | acrylic | opaque
  color: '#101018',
  opacity: 60,                    // tint opacity 0..100
  autoHide: false,
  floating: { enabled: false, marginX: 12, insetTop: 0, insetBottom: 0, radius: 12 },
  size: { height: 0, widthPct: 100, align: 'center' }, // height px (0 = как в Windows), width % of screen
  position: 'bottom',             // bottom | top | left | right (Windows 10 only)
  iconSize: 'default',            // default | small | large  (Windows 11: small/medium/large)
  centerIcons: true,              // Windows 11 only
  hide: { taskView: false, widgets: false, chat: false, search: 'default' }, // search: default|hidden|icon|box
  overlay: {
    enabled: false,
    gradient: { enabled: false, from: '#7c3aed', to: '#06b6d4', angle: 90, opacity: 35 },
    glow: { enabled: false, color: '#8b5cf6', intensity: 60 },
    shadow: { enabled: false, blur: 24, opacity: 45 },
  },
});

module.exports = {
  taskbarDefaults,
  settings: () => ({
    app: {
      theme: 'dark',              // dark | light | system
      autostart: false,
      startMinimized: false,
      closeToTray: true,
      restoreOnExit: true,        // put the Windows look back when the app is quit from the tray
      checkUpdates: true,
      updateUrl: '',
      repoUrl: '',
      developerMode: false,
      firstRun: true,
    },
    taskbar: taskbarDefaults(),
    appearance: {},               // id -> value overrides chosen by the user
    activeProfile: 'custom',
    ext: { enabled: {}, settings: {}, windowPos: {} },
    thirdparty: { manual: [] },
    update: { pending: null, lastCheck: 0 },
  }),
};
