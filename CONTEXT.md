# CONTEXT — Information carried over from this session

Date: 2026-10-24 (carried over from the llm-playground session)

## Question

> pi's chrome extension works great, is there one for librewolf (firefox)?

## Finding

- What is used is the `npm:pi-chrome` package (v0.15.57, `tianrendong/pi-chrome`).
- It is installed in the user's `~/.pi/agent/settings.json` package list.
- **There is no official LibreWolf/Firefox equivalent.**

## Why not? (technical)

- pi-chrome uses `chrome.debugger` + CDP.
- It is installed via `chrome://extensions` → Load unpacked.
- It talks to the local bridge on `127.0.0.1:17318`.
- The Firefox/LibreWolf extension API and remote-debug protocol are different
  (WebDriver BiDi / Marionette), and LibreWolf hardening adds friction.
- `pi.dev/packages` entries like `pi-chrome-use` and `pi-control-chrome` are also Chromium-based.

## Alternatives (discussed in the session)

1. Keep Chrome around just for Pi, LibreWolf stays the main browser (smoothest).
2. Work via MCP on the Firefox side (Playwright / Browser-Use MCP, added via `pi mcp`;
   signed-in profile comfort won't match pi-chrome).
3. Port from the companion code:
   `~/.pi/agent/npm/node_modules/pi-chrome/extensions/chrome-profile-bridge/browser-extension/`
   is open source but serious work.

## Pivot (2026-10-24): companion-extension architecture

The Marionette approach was abandoned: it requires launching LibreWolf with
`--marionette`, so a "normal launch + control on demand" is impossible with
it. The project now follows the pi-chrome shape instead:
- `browser-extension/` (MV2 WebExtension) runs in the user's everyday profile.
- `src/bridge.ts` hosts a localhost HTTP broker (default 127.0.0.1:17319)
  with long-poll `/next` + `/result`, multi-Pi client forwarding included.
- All 15 tools and the `/librewolf` command talk through `runAction()`.
- No flags, no Marionette, no new processes. Selenium was removed entirely.
- Install: `xpinstall.signatures.required=false` + Install Add-on From File
  (LibreWolf honors the pref; verified via sideload + full E2E suite).

- `~/Documents/repos/pi-librewolf-use/` was emptied by the user.
- The project (re)starts here with the information from this session.
- Architecture: Pi extension + Selenium WebDriver + Marionette, attaching to the running browser.
- The initial target of 18 tools in the old AGENTS.md started with 12 core tools,
  the structure is open to new tools.

## References

- pi-chrome npm: `pi-chrome@0.15.57`
- repo: https://github.com/tianrendong/pi-chrome
- docs: `~/.pi/agent/npm/node_modules/pi-chrome/docs/`
  (ARCHITECTURE.md, COMPARISON.md, EXAMPLES.md, FAQ.md)
