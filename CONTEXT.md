# CONTEXT — Bu oturumdan aktarılan bilgiler

Tarih: 2026-10-24 (llm-playground oturumundan aktarıldı)

## Soru

> pi için chrome extension çok güzel çalışıyor, librewolf (firefox) için olanı var mı?

## Bulgu

- Kullanılan şey `npm:pi-chrome` paketi (v0.15.57, `tianrendong/pi-chrome`).
- Kullanıcının `~/.pi/agent/settings.json` paket listesinde `npm:pi-chrome` yüklü.
- **Resmi LibreWolf/Firefox karşılığı yok.**

## Neden yok? (teknik)

- pi-chrome `chrome.debugger` + CDP kullanır.
- `chrome://extensions` → Load unpacked ile kurulur.
- `127.0.0.1:17318` üzerindeki local bridge ile konuşur.
- Firefox/LibreWolf eklenti API'si ve remote-debug protokolü farklı
  (WebDriver BiDi / Marionette), LibreWolf hardening'i ek engel.
- `pi.dev/packages` üzerindeki `pi-chrome-use`, `pi-control-chrome` da Chromium tabanlı.

## Alternatifler (oturumda konuşuldu)

1. Chrome'u sadece Pi için yanında tut, LibreWolf ana browser kalsın (en sorunsuz).
2. Firefox tarafında MCP ile çalış (Playwright / Browser-Use MCP, `pi mcp` ile eklenir;
   signed-in profil rahatlığı pi-chrome kadar olmaz).
3. Companion kodundan portlama:
   `~/.pi/agent/npm/node_modules/pi-chrome/extensions/chrome-profile-bridge/browser-extension/`
   açık kaynak ama ciddi iş.

## Bu repoya karar

- `~/Documents/repos/pi-librewolf-use/` içi kullanıcı tarafından boşaltıldı.
- Bu oturumdaki bilgilerle proje buraya (yeniden) açılıyor.
- Mimari: Pi extension + Selenium WebDriver + Marionette, çalışan tarayıcıya attach.
- Eski AGENTS.md'deki 18 araç hedefi ilk etapta 12 çekirdek araçla başlatıldı,
  yapı yeni araç eklemeye açık.

## Kaynaklar

- pi-chrome npm: `pi-chrome@0.15.57`
- repo: https://github.com/tianrendong/pi-chrome
- docs: `~/.pi/agent/npm/node_modules/pi-chrome/docs/`
  (ARCHITECTURE.md, COMPARISON.md, EXAMPLES.md, FAQ.md)
