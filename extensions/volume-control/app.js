(async () => {
  let cfg = await safe(() => hub.settings.get(), { step: 5 }); hub.on('settings', (s) => (cfg = s));
  const vol = $('#vol'), pct = $('#pct'), mute = $('#mute'); let muted = false, lock = false;
  const show = (s) => { if (!s) { $('#hint').textContent = 'Звуковое устройство недоступно'; return; } muted = s.muted; if (!lock) vol.value = s.level; pct.textContent = muted ? 'Без звука' : s.level + '%'; mute.textContent = muted || s.level === 0 ? '🔇' : s.level < 40 ? '🔈' : '🔊'; };
  const refresh = async () => show(await safe(() => hub.audio.get()));
  vol.oninput = () => { lock = true; pct.textContent = vol.value + '%'; clearTimeout(vol.t); vol.t = setTimeout(async () => { show(await safe(() => hub.audio.set(Number(vol.value)))); lock = false; }, 60); };
  mute.onclick = async () => show(await safe(() => hub.audio.mute(!muted)));
  document.addEventListener('wheel', async (e) => { const v = Math.max(0, Math.min(100, Number(vol.value) + (e.deltaY < 0 ? 1 : -1) * (cfg.step || 5))); vol.value = v; show(await safe(() => hub.audio.set(v))); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hub.window.hide(); });
  refresh(); setInterval(refresh, 2000); window.addEventListener('focus', refresh);
})();
