# librewolf-browser (Pi extension)

Çalışan LibreWolf/Firefox'a bağlanır. Tarayıcı eklentisi değildir, yeni
tarayıcı başlatmaz.

## Kurulum

1. LibreWolf → `about:config` → `marionette.enabled = true`
2. `marionette.port` (varsayılan 2828)
3. Gerekirse: `npm install` (bu klasörde — selenium-webdriver için)
4. Pi'yi repo kökünde başlat, extension otomatik yüklenir.

## Ortam değişkenleri

- `LIBREWOLF_MARIONETTE_HOST` (varsayılan 127.0.0.1)
- `LIBREWOLF_MARIONETTE_PORT` (varsayılan 2828)
- `LIBREWOLF_BINARY` (opsiyonel)
