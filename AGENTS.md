# AGENTS — Project Agent Rules

## Bu proje nedir?

Pi coding agent'in çalışan bir LibreWolf (veya Firefox) örneğini uzaktan
kullanması için Pi extension'ı. 12 araç: bağlantı durumu, sekme yönetimi,
navigasyon, sayfa snapshot'ı, tıklama, form doldurma, tuş, JS çalıştırma,
screenshot, bekleme.

**Önemli:** Bu extension `.pi/extensions/librewolf-browser/` altına kurulur —
bir **tarayıcı eklentisi değildir**. Çalışan tarayıcıya Marionette protokolü
üzerinden (Selenium WebDriver ile) bağlanır.

**⚠️ KRİTİK KURAL: Asla yeni bir LibreWolf instance'ı başlatma. Hep zaten
açık olan LibreWolf/Firefox tarayıcısına bağlan.** Extension `--connect-existing`
mantığıyla attach olur, tarayıcı başlatmaz.

## Proje yapısı

```
.pi/extensions/librewolf-browser/
├── package.json          # selenium-webdriver, geckodriver
├── src/
│   ├── index.ts          # Pi extension — araç kayıtları
│   └── firefox-client.ts # LibreWolfClient — Selenium WebDriver sarmalayıcı
└── README.md             # Kurulum + kullanım
```

Kök dizinde ayrıca `README.md`, `CONTEXT.md`, `package.json`, `tsconfig.json`
vardır (derleme + tip kontrolü için).

## Tarayıcı kurulumu

1. LibreWolf → `about:config`
2. `marionette.enabled` = `true`
3. `marionette.port` değerini not et (varsayılan `2828`)

## Ortam değişkenleri

- `LIBREWOLF_MARIONETTE_HOST` (varsayılan `127.0.0.1`)
- `LIBREWOLF_MARIONETTE_PORT` (varsayılan `2828`)
- `LIBREWOLF_BINARY` (opsiyonel, sadece fallback için)

## Kod kuralları

- Yeni araç eklerken `defineTool` + `Type.Object` parametre şeması kullan.
- Her araç `try/finally` içinde driver'ı paylaşır, kapatmaz (session boyunca tek driver).
- Bağlantı hatasında kullanıcıya `about:config` adımlarını söyleyen Türkçe mesaj döndür.
- Screenshot'lar varsayılan olarak `.pi/librewolf-screenshots/` altına tarihli isimle kaydedilir.
- `evaluate` ile dönen değer JSON-serialize edilebilir olmalı.
