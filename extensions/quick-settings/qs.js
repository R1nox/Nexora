(async () => {
  let cfg = await safe(() => hub.settings.get(), {}); const grid = $('#grid');
  async function load() {
    const list = await safe(() => hub.os.toggles(), []); grid.innerHTML = '';
    for (const t of list) {
      const d = document.createElement('div'); d.className = 't' + (t.value ? ' on' : '') + (t.supported ? '' : ' off');
      d.innerHTML = '<div class="n"></div><div class="s"></div>'; $('.n', d).textContent = t.label; $('.s', d).textContent = t.supported ? (t.value ? 'Включено' : 'Выключено') : 'Не поддерживается';
      if (t.supported) d.onclick = async () => { d.style.opacity = .6; await safe(() => hub.os.set(t.id, !t.value)); load(); };
      grid.append(d);
    }
  }
  async function vol() {
    $('#vol').classList.toggle('hide', cfg.showVolume === false); if (cfg.showVolume === false) return;
    const s = await safe(() => hub.audio.get()); if (s) { $('#vr').value = s.level; $('#vi').textContent = s.muted ? '🔇' : '🔊'; }
  }
  $('#vr').oninput = () => { clearTimeout($('#vr').t); $('#vr').t = setTimeout(() => safe(() => hub.audio.set(Number($('#vr').value))), 60); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hub.window.hide(); });
  window.addEventListener('focus', () => { load(); vol(); }); hub.on('settings', (s) => { cfg = s; vol(); });
  load(); vol();
})();
