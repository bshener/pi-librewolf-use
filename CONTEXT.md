# CONTEXT — Background and architecture notes

## Question

> Pi's Chrome extension works great, is there one for LibreWolf (Firefox)?

## Finding

- What is used on the Chrome side is the `npm:pi-chrome` package
  (`tianrendong/pi-chrome`).
- It attaches to a Chrome/Chromium profile via `chrome.debugger` + CDP
  (load unpacked via `chrome://extensions`, local bridge on `127.0.0.1:17318`).
- **There is no official LibreWolf/Firefox equivalent.**

## Why not? (technical)

- pi-chrome uses `chrome.debugger` + CDP.
- The Firefox/LibreWolf extension API and remote-debug protocol are different
  (WebDriver BiDi / Marionette), and LibreWolf hardening adds friction.
- `pi.dev/packages` entries like `pi-chrome-use` and `pi-control-chrome` are
  also Chromium-based.

## Alternatives considered

1. Keep Chrome around just for Pi, LibreWolf stays the main browser (smoothest).
2. Work via MCP on the Firefox side (Playwright / Browser-Use MCP via `pi mcp`;
   signed-in profile comfort won't match pi-chrome).
3. Port from the companion code: pi-chrome's `extensions/chrome-profile-bridge/`
   is open source but serious work.

## Architecture (this repo)

The Marionette approach was abandoned: it requires launching LibreWolf with
`--marionette`, so a "normal launch + control on demand" is impossible with
it. This project follows the pi-chrome shape instead:

- `browser-extension/` (MV2 WebExtension) runs in the user's everyday profile.
- `src/bridge.ts` hosts a localhost HTTP broker (default `127.0.0.1:17319`)
  with long-poll `/next` + `/result`, multi-Pi client forwarding included.
- All 17 tools and the `/librewolf` command talk through `runAction()`.
- No flags, no Marionette, no new processes. Selenium was removed entirely.
- Install: `xpinstall.signatures.required=false` + Install Add-on From File
  (LibreWolf honors the pref; verified via sideload + full E2E suite).

## References

- pi-chrome npm: `pi-chrome`
- repo: https://github.com/tianrendong/pi-chrome
