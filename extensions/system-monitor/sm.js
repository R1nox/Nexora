(async () => {
  let cfg = await safe(() => hub.settings.get(), {}); let st = null;
  const rows = $('#rows');
  const metric = (id, label) => { const d = document.createElement('div'); d.className = 'm'; d.id = 'm-' + id; d.innerHTML = `<div class="row"><span class="dim">${label}</span><span class="sp"></span><b></b></div><div class="bar"><i></i></div>`; return d; };
  const draw = () => {
    document.documentElement.style.setProperty('--acc', cfg.accent || '#8b5cf6');
    const want = [['cpu', 'CPU']]; if (cfg.showGpu !== false) want.push(['gpu', 'GPU']); want.push(['ram', 'Память']);
    if (rows.dataset.k !== want.map((w) => w[0]).join()) { rows.innerHTML = ''; want.forEach(([i, l]) => rows.append(metric(i, l))); if (cfg.showTemp !== false) { const t = document.createElement('div'); t.id = 'temp'; t.className = 'sm dim'; t.style.marginTop = '12px'; rows.append(t); } rows.dataset.k = want.map((w) => w[0]).join(); }
    if (!st) return;
    const set = (id, v, txt) => { const m = $('#m-' + id); if (!m) return; $('b', m).textContent = txt; $('i', m).style.width = (v ?? 0) + '%'; };
    set('cpu', st.cpu, st.cpu + '%'); set('gpu', st.gpu, st.gpu == null ? 'н/д' : st.gpu + '%');
    set('ram', st.ram.pct, `${fmtBytes(st.ram.used)} / ${fmtBytes(st.ram.total)}`);
    const t = $('#temp'); if (t) { const c = st.temp?.cpu, g = st.temp?.gpu; t.textContent = c == null && g == null ? 'Температура: недоступна (нужен LibreHardwareMonitor или права)' : `Температура: CPU ${c ?? '—'}°  ·  GPU ${g ?? '—'}°`; }
  };
  hub.on('stats', (s) => { st = s; draw(); }); hub.on('settings', (s) => { cfg = s; draw(); });
  st = await safe(() => hub.system.stats()); draw();
})();
