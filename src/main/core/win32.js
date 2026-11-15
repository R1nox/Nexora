'use strict';
// Native Windows API access through koffi (FFI). Every call is guarded: if the API cannot be
// loaded (non-Windows dev machine, unexpected OS), `available` is false and callers degrade gracefully.
const { isWin } = require('./platform');

const api = { available: false, error: null };

if (isWin) {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    const shell32 = koffi.load('shell32.dll');

    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const AccentPolicy = koffi.struct('AccentPolicy', { AccentState: 'int32', AccentFlags: 'int32', GradientColor: 'uint32', AnimationId: 'int32' });
    const WCAD = koffi.struct('WINCOMPATTRDATA', { Attrib: 'int32', pvData: koffi.pointer(AccentPolicy), cbData: 'size_t' });
    const APPBARDATA = koffi.struct('APPBARDATA', {
      cbSize: 'uint32', hWnd: 'void *', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t',
    });
    const ANIMINFO = koffi.struct('ANIMATIONINFO', { cbSize: 'uint32', iMinAnimate: 'int32' });

    const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 cls, str16 title)');
    const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 cls, str16 title)');
    const GetWindowRect = user32.func('int __stdcall GetWindowRect(void *h, _Out_ RECT *r)');
    const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
    const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *h, _Out_ uint8_t *buf, int n)');
    const IsZoomed = user32.func('int __stdcall IsZoomed(void *h)');
    const IsIconic = user32.func('int __stdcall IsIconic(void *h)');
    const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *h)');
    const SetWindowCompositionAttribute = user32.func('int __stdcall SetWindowCompositionAttribute(void *h, _Inout_ WINCOMPATTRDATA *d)');
    const SetWindowRgn = user32.func('int __stdcall SetWindowRgn(void *h, void *rgn, int redraw)');
    const SendMessageW = user32.func('intptr_t __stdcall SendMessageW(void *h, uint32 msg, uintptr_t w, intptr_t l)');
    const SendMessageTimeoutW = user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t h, uint32 msg, uintptr_t w, str16 l, uint32 flags, uint32 timeout, _Out_ uintptr_t *res)');
    const SpiVal = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, intptr_t c, uint32 d)');
    const SpiOut = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, _Out_ int32 *c, uint32 d)');
    const SpiStr = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, str16 c, uint32 d)');
    const SpiBuf = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, uint8_t *c, uint32 d)');
    const SpiAnim = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, _Inout_ ANIMATIONINFO *c, uint32 d)');
    const SetWindowPos = user32.func('int __stdcall SetWindowPos(void *h, void *after, int x, int y, int cx, int cy, uint32 flags)');
    const SpiRectOut = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, _Out_ RECT *c, uint32 d)');
    const SpiRectIn = user32.func('int __stdcall SystemParametersInfoW(uint32 a, uint32 b, RECT *c, uint32 d)');
    const CreateRoundRectRgn = gdi32.func('void * __stdcall CreateRoundRectRgn(int a, int b, int c, int d, int e, int f)');
    const SHAppBarMessage = shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32 msg, _Inout_ APPBARDATA *d)');

    const addr = (p) => (p ? koffi.address(p) : null);
    const same = (a, b) => addr(a) === addr(b);

    api.available = true;
    api.addr = addr;

    api.className = (h) => {
      const buf = Buffer.alloc(512);
      const n = GetClassNameW(h, buf, 256);
      return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
    };
    api.rect = (h) => { const r = {}; return GetWindowRect(h, r) ? r : null; };

    // primary + secondary taskbars
    api.getTaskbars = () => {
      const out = [];
      const primary = FindWindowW('Shell_TrayWnd', null);
      if (primary) out.push({ hwnd: primary, primary: true });
      let prev = null;
      for (let i = 0; i < 8; i++) {
        const w = FindWindowExW(null, prev, 'Shell_SecondaryTrayWnd', null);
        if (!w) break;
        out.push({ hwnd: w, primary: false }); prev = w;
      }
      return out;
    };

    // state: 0 off, 1 gradient, 2 transparent gradient (solid colour / clear), 3 blur-behind, 4 acrylic
    api.setAccent = (hwnd, state, abgr) => {
      const policy = { AccentState: state, AccentFlags: state === 0 ? 0 : 2, GradientColor: abgr >>> 0, AnimationId: 0 };
      return SetWindowCompositionAttribute(hwnd, { Attrib: 19, pvData: policy, cbData: koffi.sizeof(AccentPolicy) }) !== 0;
    };
    api.setRoundRegion = (hwnd, l, t, r, b, radius) => {
      const rgn = CreateRoundRectRgn(l, t, r + 1, b + 1, radius * 2, radius * 2);
      return SetWindowRgn(hwnd, rgn, 1) !== 0; // the system owns the region after this call
    };
    api.setPos = (hwnd, x, y, w, h) => SetWindowPos(hwnd, null, x, y, w, h, 0x4 | 0x10) !== 0; // SWP_NOZORDER | SWP_NOACTIVATE
    api.getWorkArea = () => { const r = {}; return SpiRectOut(0x30, 0, r, 0) ? r : null; };
    api.setWorkArea = (r) => SpiRectIn(0x2F, 0, r, 0x2) !== 0; // SPI_SETWORKAREA, not persisted
    api.clearRegion = (hwnd) => SetWindowRgn(hwnd, null, 1) !== 0;

    api.foreground = () => {
      const h = GetForegroundWindow();
      if (!h) return null;
      return { hwnd: h, cls: api.className(h), zoomed: !!IsZoomed(h), iconic: !!IsIconic(h), visible: !!IsWindowVisible(h) };
    };
    api.isVisible = (h) => !!IsWindowVisible(h);

    // taskbar auto-hide through the official AppBar API
    api.getAutoHide = () => {
      const h = FindWindowW('Shell_TrayWnd', null);
      const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: h, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
      return (Number(SHAppBarMessage(4, d)) & 1) === 1; // ABM_GETSTATE, ABS_AUTOHIDE
    };
    api.setAutoHide = (on) => {
      const h = FindWindowW('Shell_TrayWnd', null);
      const d = { cbSize: koffi.sizeof(APPBARDATA), hWnd: h, uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: on ? 1 : 2 };
      SHAppBarMessage(0xA, d); // ABM_SETSTATE
    };

    api.broadcastSetting = (name) => {
      const res = [0];
      SendMessageTimeoutW(0xFFFF, 0x1A, 0, name, 2, 1500, res); // WM_SETTINGCHANGE
    };

    // SystemParametersInfo helpers (all take effect immediately and persist for the user profile)
    const FLAGS = 0x1 | 0x2; // SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
    api.spiGetInt = (action) => { const o = [0]; return SpiOut(action, 0, o, 0) ? o[0] : null; };
    api.spiSetBool = (action, on) => SpiVal(action, 0, on ? 1 : 0, FLAGS) !== 0;       // value in pvParam
    api.spiSetUiParam = (action, v) => SpiVal(action, v, 0, FLAGS) !== 0;               // value in uiParam
    api.spiSetPvInt = (action, v) => SpiVal(action, 0, v, FLAGS) !== 0;
    api.spiGetWallpaper = () => { const b = Buffer.alloc(1040); return SpiBuf(0x73, 520, b, 0) ? b.toString('utf16le').split('\0')[0] : ''; };
    api.spiSetWallpaper = (p) => SpiStr(0x14, 0, p, FLAGS) !== 0;
    api.spiGetMinAnimate = () => { const i = { cbSize: 8, iMinAnimate: 0 }; return SpiAnim(0x48, 8, i, 0) ? i.iMinAnimate === 1 : null; };
    api.spiSetMinAnimate = (on) => SpiAnim(0x49, 8, { cbSize: 8, iMinAnimate: on ? 1 : 0 }, FLAGS) !== 0;
    api.reloadCursors = () => SpiVal(0x57, 0, 0, FLAGS) !== 0; // SPI_SETCURSORS

    // Desktop icons toggle (same command Explorer's "Show desktop icons" uses)
    api.findDefView = () => {
      const progman = FindWindowW('Progman', null);
      let v = progman ? FindWindowExW(progman, null, 'SHELLDLL_DefView', null) : null;
      if (!v) {
        let w = null;
        for (let i = 0; i < 20 && !v; i++) {
          w = FindWindowExW(null, w, 'WorkerW', null);
          if (!w) break;
          v = FindWindowExW(w, null, 'SHELLDLL_DefView', null);
        }
      }
      return v;
    };
    api.toggleDesktopIcons = () => { const v = api.findDefView(); if (v) SendMessageW(v, 0x111, 0x7402, 0); return !!v; };
    api.same = same;
  } catch (e) {
    api.available = false;
    api.error = e && e.message;
  }
}
module.exports = api;
