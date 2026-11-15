(async () => {
  let cfg = await safe(() => hub.settings.get(), {});
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const mons = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const cv = $('#a'), g = cv.getContext('2d');
  function analog(now) {
    const w = cv.width, c = w / 2, r = c - 10; g.clearRect(0, 0, w, w); g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.beginPath(); g.moveTo(c + Math.sin(a) * (r - 8), c - Math.cos(a) * (r - 8)); g.lineTo(c + Math.sin(a) * (r - 2), c - Math.cos(a) * (r - 2)); g.stroke(); }
    const hand = (a, l, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(a) * l, c - Math.cos(a) * l); g.stroke(); };
    const s = now.getSeconds() + now.getMilliseconds() / 1000, m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
    hand((h / 12) * 6.283, r * .5, 6, '#fff'); hand((m / 60) * 6.283, r * .75, 4, '#fff'); if (cfg.seconds) hand((s / 60) * 6.283, r * .85, 2, cfg.accent || '#8b5cf6');
    g.fillStyle = cfg.accent || '#8b5cf6'; g.beginPath(); g.arc(c, c, 6, 0, 7); g.fill();
  }
  function tick() {
    document.documentElement.style.setProperty('--acc', cfg.accent || '#8b5cf6');
    const n = new Date(), st = cfg.style || 'digital';
    $('#digital').style.display = st === 'analog' ? 'none' : ''; cv.style.display = st === 'analog' ? '' : 'none';
    if (st === 'analog') { analog(n); return; }
    let h = n.getHours(), suf = ''; if (!cfg.hour24) { suf = h >= 12 ? ' PM' : ' AM'; h = h % 12 || 12; }
    const t = $('#t'); t.textContent = `${cfg.hour24 ? pad(h) : h}:${pad(n.getMinutes())}${cfg.seconds ? ':' + pad(n.getSeconds()) : ''}${suf}`;
    t.style.cssText = st === 'minimal' ? 'font-size:52px;font-weight:300;letter-spacing:-.04em' : 'background:linear-gradient(90deg,#fff,var(--acc));-webkit-background-clip:text;color:transparent';
    $('#d').textContent = cfg.date === false ? '' : `${days[n.getDay()]}, ${n.getDate()} ${mons[n.getMonth()]}`;
  }
  hub.on('settings', (s) => { cfg = s; tick(); }); tick(); setInterval(tick, 250);
})();
