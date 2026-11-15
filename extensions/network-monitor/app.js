(async () => {
  let cfg = await safe(() => hub.settings.get(), {}); const hist = Array(60).fill(0), hu = Array(60).fill(0);
  const fmt = (b) => (cfg.unitBits ? ((b * 8) / 1e6).toFixed(b * 8 > 1e7 ? 0 : 1) + ' Мбит/с' : fmtRate(b));
  const c = $('#c'), g = c.getContext('2d');
  const draw = () => {
    const w = c.width, h = c.height; g.clearRect(0, 0, w, h); const max = Math.max(1e4, ...hist, ...hu);
    const line = (a, col) => { g.beginPath(); a.forEach((v, i) => { const x = (i / 59) * w, y = h - 3 - (v / max) * (h - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); };
    line(hu, 'rgba(255,255,255,.35)'); line(hist, cfg.accent || '#22d3ee');
  };
  const apply = () => { $('#unit').textContent = cfg.unitBits ? 'Мбит/с' : 'байт/с'; };
  hub.on('settings', (s) => { cfg = s; apply(); });
  hub.on('stats', (s) => { hist.push(s.net.down); hist.shift(); hu.push(s.net.up); hu.shift(); $('#dn').textContent = fmt(s.net.down); $('#up').textContent = fmt(s.net.up); draw(); });
  apply();
})();
