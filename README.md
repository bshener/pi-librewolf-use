# pi-librewolf-use

Pi coding agent'in çalışan bir LibreWolf / Firefox örneğini uzaktan kullanması için
Pi extension'ı. Tarayıcı eklentisi **değildir** — Selenium WebDriver + Marionette
üzerinden zaten açık olan tarayıcıya bağlanır.

> Neden bu proje? `npm:pi-chrome` (v0.15.57, `tianrendong/pi-chrome`) sadece
> Chrome/Chromium profiline bağlanır (`chrome.debugger` + CDP,
> `chrome://extensions` ile load unpacked, `127.0.0.1:17318` bridge).
> LibreWolf/Firefox için resmi karşılığı yoktur. Bu repo o boşluğu doldurur.

## Kural (kritik)

**Asla yeni LibreWolf instance'ı başlatma. Hep zaten açık olan tarayıcıya bağlan.**
Extension `--connect-existing` mantığıyla çalışan instance'a attach olur.

## Kurulum

1. LibreWolf'u aç → `about:config`
2. `marionette.enabled` = `true`
3. `marionette.port` değerini not et (varsayılan `2828`)
4. Bu dizide Pi'yi başlat:

```bash
cd ~/Documents/repos/pi-librewolf-use
pi
```

Extension `.pi/extensions/librewolf-browser/` altından otomatik yüklenir.

Ortam değişkenleri:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `LIBREWOLF_MARIONETTE_HOST` | `127.0.0.1` | Marionette host |
| `LIBREWOLF_MARIONETTE_PORT` | `2828` | `about:config` → `marionette.port` |
| `LIBREWOLF_BINARY` | otomatik | Gerekirse ikili yol (sadece fallback launch için) |

## Araçlar

| Araç | Ne yapar |
|---|---|
| `librewolf_status` | Bağlantı + tarayıcı bilgisi |
| `librewolf_tabs` | Açık sekmeleri/pencereleri listele |
| `librewolf_navigate` | URL'ye git |
| `librewolf_back` / `librewolf_forward` / `librewolf_reload` | Geçmiş + yenileme |
| `librewolf_snapshot` | Sayfanın erişilebilirlik ağacı / başlık + link/button özeti |
| `librewolf_click` | CSS selector ile tıkla |
| `librewolf_type` | Odaklanıp metin yaz (append) |
| `librewolf_fill` | Input/textarea değerini değiştir |
| `librewolf_press_key` | Tuş gönder (Enter, Escape, Tab, …) |
| `librewolf_evaluate` | Sayfada JS çalıştır (JSON döner) |
| `librewolf_screenshot` | Ekran görüntüsü alıp dosyaya kaydet |
| `librewolf_wait_for` | Selector ya da JS koşulu bekle |

Detaylı ajan kuralları için `AGENTS.md`, bu oturumdan aktarılan bağlam için
`CONTEXT.md` dosyasına bak.
