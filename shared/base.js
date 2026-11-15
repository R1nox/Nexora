/* tiny helpers for extension windows */
window.$ = (s, r = document) => r.querySelector(s);
window.$$ = (s, r = document) => [...r.querySelectorAll(s)];
window.fmtRate = (b) => { const u = ['Б/с', 'КБ/с', 'МБ/с', 'ГБ/с']; let i = 0; b = b || 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i]; };
window.fmtBytes = (b) => (b / 1073741824).toFixed(1) + ' ГБ';
window.pad = (n) => String(n).padStart(2, '0');
window.safe = async (fn, fallback = null) => { try { return await fn(); } catch (e) { hub.log('warn', String(e && e.message || e)); return fallback; } };
