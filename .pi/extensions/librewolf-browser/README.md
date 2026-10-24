# librewolf-browser (Pi extension)

Attaches to a running LibreWolf/Firefox. It is not a browser extension and never
starts a new browser.

## Setup

1. LibreWolf → `about:config` → `marionette.enabled = true`
2. Note `marionette.port` (default 2828)
3. Fully quit LibreWolf and relaunch it with the `--marionette` flag
4. If needed: `npm install` (in this folder — for selenium-webdriver)
5. Start Pi in the repo root, the extension loads automatically.

## Commands

- `/librewolf connect` — connect to the currently open browser
- `/librewolf status` — same as connect
- `/librewolf tabs` — report open tabs
- `/librewolf doctor` — diagnose port / connection issues

## Environment variables

- `LIBREWOLF_MARIONETTE_HOST` (default `127.0.0.1`)
- `LIBREWOLF_MARIONETTE_PORT` (default `2828`)
- `LIBREWOLF_BINARY` (optional)
