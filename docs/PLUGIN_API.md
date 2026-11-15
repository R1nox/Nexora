# API расширений (версия 1)
Пакет `.wcx` — zip с `manifest.json` (id, name, version, apiVersion, permissions, windows[], settings[], dependencies, minHub) и файлами html/js/css/svg/png/json. В окне доступен `window.hub`:
`log`, `storage.get/set`, `settings.get/set`, `notify`, `system.stats`, `system.info`, `audio.get/set/mute`, `media.get/cmd`, `fetch` (только хосты из манифеста), `apps.launch`, `system.openSettings`, `window.*`.
Разрешения: storage, settings, notifications, system.stats, system.info, audio.read, audio.control, media.read, media.control, network, apps.launch, system.settings, window. Каждый вызов проверяется в основном процессе; пользователь может отозвать разрешение.
Подпись: Ed25519 по `id\nversion\nsha256(пакета)`. Хост-модуль `dynamic-taskbar` — только для подписанных. Ошибки и `console.*` расширения пишутся в его журнал; при более чем 3 падениях в минуту расширение отключается.
