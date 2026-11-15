(async () => {
  let cfg = await safe(() => hub.settings.get(), {}); hub.on('settings', (s) => { cfg = s; paint(); });
  const paint = () => document.documentElement.style.setProperty('--acc', cfg.accent || '#ec4899'); paint();
  async function refresh() {
    const m = await safe(() => hub.media.get(), null);
    if (!m || !m.available || !m.title) { $('#t').textContent = 'Ничего не играет'; $('#a').textContent = 'Запустите музыку в любом плеере'; $('#p').style.width = '0'; $('#play').textContent = '▶'; return; }
    $('#t').textContent = m.title; $('#a').textContent = m.artist || m.app || ''; $('#p').style.width = m.duration ? Math.min(100, (m.position / m.duration) * 100) + '%' : '0'; $('#play').textContent = m.status === 'Playing' ? '⏸' : '▶';
  }
  $('#play').onclick = async () => { await safe(() => hub.media.cmd('toggle')); setTimeout(refresh, 350); };
  $('#prev').onclick = async () => { await safe(() => hub.media.cmd('prev')); setTimeout(refresh, 600); };
  $('#next').onclick = async () => { await safe(() => hub.media.cmd('next')); setTimeout(refresh, 600); };
  refresh(); setInterval(refresh, 1500);
})();
