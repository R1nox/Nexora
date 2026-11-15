(async () => {
  let cfg = await safe(() => hub.settings.get(), {});
  const WMO = { 0: ['☀️', 'Ясно'], 1: ['🌤️', 'Малооблачно'], 2: ['⛅', 'Переменная облачность'], 3: ['☁️', 'Пасмурно'], 45: ['🌫️', 'Туман'], 48: ['🌫️', 'Изморозь'], 51: ['🌦️', 'Морось'], 53: ['🌦️', 'Морось'], 55: ['🌦️', 'Сильная морось'], 61: ['🌧️', 'Дождь'], 63: ['🌧️', 'Дождь'], 65: ['🌧️', 'Сильный дождь'], 71: ['🌨️', 'Снег'], 73: ['🌨️', 'Снег'], 75: ['❄️', 'Сильный снег'], 80: ['🌦️', 'Ливень'], 81: ['🌧️', 'Ливень'], 82: ['⛈️', 'Сильный ливень'], 95: ['⛈️', 'Гроза'], 96: ['⛈️', 'Гроза с градом'], 99: ['⛈️', 'Гроза с градом'] };
  async function geo(city) {
    const key = 'geo:' + city.toLowerCase(); const c = await safe(() => hub.storage.get(key)); if (c) return c;
    const r = await hub.net.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`);
    if (!r.results || !r.results[0]) throw new Error('Город не найден'); const x = r.results[0]; const v = { lat: x.latitude, lon: x.longitude, name: x.name, country: x.country || '' };
    await safe(() => hub.storage.set(key, v)); return v;
  }
  async function load() {
    $('#desc').textContent = 'Загрузка…';
    try {
      const place = await geo((cfg.city || 'Kyiv').trim()); const f = cfg.units === 'f';
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1${f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''}`;
      const w = await hub.net.fetchJson(u); const cu = w.current, sym = f ? '°F' : '°C';
      const [ico, txt] = WMO[cu.weather_code] || ['🌡️', 'Погода'];
      $('#city').textContent = `${place.name}${place.country ? ', ' + place.country : ''}`; $('#ico').textContent = ico; $('#t').textContent = Math.round(cu.temperature_2m) + '°'; $('#desc').textContent = txt;
      $('#fl').textContent = `Ощущается ${Math.round(cu.apparent_temperature)}°`; $('#wd').textContent = `Ветер ${Math.round(cu.wind_speed_10m)} ${f ? 'миль/ч' : 'км/ч'}`; $('#hu').textContent = `${cu.relative_humidity_2m}%`;
      $('#rg').textContent = `Сегодня: ${Math.round(w.daily.temperature_2m_min[0])}…${Math.round(w.daily.temperature_2m_max[0])}${sym}`;
    } catch (e) { $('#desc').textContent = 'Нет данных: ' + e.message; hub.log('warn', e.message); }
  }
  $('#rf').onclick = load; hub.on('settings', (s) => { cfg = s; load(); }); load(); setInterval(load, 15 * 60 * 1000);
})();
