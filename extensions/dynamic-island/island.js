(async () => {
  const el = $('#island'); let cfg = await safe(() => hub.settings.get(), {}); let hover = false, notifTimer = null, hasMedia = false, lastStats = null, expandedByNotif = false;
  const applyCfg = () => { document.documentElement.style.setProperty('--acc', cfg.accent || '#8b5cf6'); };
  applyCfg(); hub.on('settings', (s) => { cfg = s; applyCfg(); refreshMedia(); });
  const resize = () => requestAnimationFrame(() => { const h = Math.ceil(el.getBoundingClientRect().height) + 10; hub.window.resize(440, Math.max(44, h), false); });
  const open = () => { el.classList.replace('collapsed', 'open'); setTimeout(resize, 30); };
  const close = () => { if (hover || expandedByNotif) return; el.classList.replace('open', 'collapsed'); setTimeout(resize, 360); };
  el.addEventListener('mouseenter', () => { hover = true; if (cfg.expandOnHover) open(); });
  el.addEventListener('mouseleave', () => { hover = false; setTimeout(close, 700); });
  el.addEventListener('click', () => (el.classList.contains('open') ? (hover = false, close()) : open()));
  const tick = () => { const d = new Date(); $('#title').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  tick(); setInterval(tick, 5000);

  async function refreshMedia() {
    const m = cfg.showMedia ? await safe(() => hub.media.get(), null) : null;
    hasMedia = !!(m && m.available && m.title);
    $('#media').classList.toggle('hide', !hasMedia);
    if (hasMedia) {
      $('#mt').textContent = m.title; $('#ma').textContent = m.artist || m.app || '';
      $('#mp').style.width = m.duration ? Math.min(100, (m.position / m.duration) * 100) + '%' : '0';
      $('#mini').textContent = m.status === 'Playing' ? '♪ ' + (m.title.length > 14 ? m.title.slice(0, 13) + '…' : m.title) : '';
    } else $('#mini').textContent = '';
    if (el.classList.contains('open')) resize();
  }
  refreshMedia(); setInterval(refreshMedia, 2500);
  $('#play').onclick = (e) => { e.stopPropagation(); hub.media.cmd('toggle'); setTimeout(refreshMedia, 400); };
  $('#prev').onclick = (e) => { e.stopPropagation(); hub.media.cmd('prev'); setTimeout(refreshMedia, 600); };
  $('#next').onclick = (e) => { e.stopPropagation(); hub.media.cmd('next'); setTimeout(refreshMedia, 600); };

  hub.on('stats', (s) => {
    lastStats = s; if (!cfg.showStats) { $('#stats').classList.add('hide'); return; }
    $('#stats').classList.remove('hide');
    $('#cpu').style.width = s.cpu + '%'; $('#ram').style.width = s.ram.pct + '%'; $('#sv').textContent = `${s.cpu}% · ${s.ram.pct}%`;
  });
  hub.on('notification', (n) => {
    const box = $('#notif'); box.classList.remove('hide'); box.innerHTML = '';
    const a = document.createElement('div'); a.className = 'sm dim'; a.textContent = n.source || 'Hub';
    const b = document.createElement('div'); b.className = 'mid'; b.textContent = (n.icon ? n.icon + ' ' : '') + n.text;
    box.append(a, b); expandedByNotif = true; open();
    clearTimeout(notifTimer); notifTimer = setTimeout(() => { expandedByNotif = false; box.classList.add('hide'); close(); }, 4500);
  });
  setTimeout(resize, 100);
})();
