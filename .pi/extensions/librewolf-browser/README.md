# librewolf-browser (Pi extension)

Controls the user's normal LibreWolf/Firefox through the companion
"LibreWolf Pi Bridge" WebExtension and a machine-local HTTP broker.
It is not a browser extension, launches nothing, and needs no flags
or Marionette — the browser stays completely normal.

## Setup (user, one time)

1. LibreWolf → `about:config` → `xpinstall.signatures.required = false`
2. `about:addons` → gear icon → Install Add-on From File →
   `browser-extension/` from this repo (or the packaged
   `librewolf-pi-bridge.xpi`)
3. Keep that LibreWolf window open, start Pi in the repo root —
   the broker starts automatically.

## Commands

- `/librewolf` — Pi-readable status summary (opens nothing)
- `/librewolf tab [url]` — open a new tab in the current window
- `/librewolf close [handle]` — close a tab by its handle
- `/librewolf connect` / `status` — check the connection
- `/librewolf tabs` — report open tabs
- `/librewolf window [url]` — open a new window, optionally at a URL
- `/librewolf doctor` — diagnose bridge / extension connection
- `/librewolf onboard` — print the install steps

## Environment variables

- `LIBREWOLF_BRIDGE_HOST` (default `127.0.0.1`)
- `LIBREWOLF_BRIDGE_PORT` (default `17319`)
