(async () => {
  let apps = [];
  async function load() { apps = await safe(() => hub.apps.list(), []); draw(); }
  function draw() {
    const q = $('#q').value.toLowerCase(), grid = $('#grid'); grid.innerHTML = '';
    const list = apps.filter((a) => a.name.toLowerCase().includes(q)); $('#empty').style.display = apps.length ? 'none' : '';
    for (const a of list) {
      const d = document.createElement('div'); d.className = 'app';
      let ic; if (a.icon) { ic = document.createElement('img'); ic.src = a.icon; } else { ic = document.createElement('div'); ic.className = 'ph'; ic.textContent = a.name[0].toUpperCase(); }
      const s = document.createElement('span'); s.textContent = a.name; const x = document.createElement('i'); x.className = 'x'; x.textContent = '✕'; x.title = 'Убрать из списка';
      x.onclick = async (e) => { e.stopPropagation(); await safe(() => hub.apps.remove(a.id)); load(); };
      d.onclick = async () => { const r = await safe(() => hub.apps.launch(a.id), 'err'); if (r !== 'err') hub.window.hide(); };
      d.append(ic, s, x); grid.append(d);
    }
  }
  $('#q').oninput = draw;
  $('#q').onkeydown = (e) => { if (e.key === 'Enter') { const f = apps.filter((a) => a.name.toLowerCase().includes($('#q').value.toLowerCase()))[0]; if (f) hub.apps.launch(f.id).then(() => hub.window.hide()); } };
  $('#add').onclick = async () => { await safe(() => hub.apps.pick()); load(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hub.window.hide(); });
  window.addEventListener('focus', () => { $('#q').focus(); load(); });
  hub.on('settings', load); load();
})();
