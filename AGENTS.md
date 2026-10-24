# AGENTS — Project Agent Rules

## What is this project?

A Pi coding agent extension to remotely control the user's normal LibreWolf
(or Firefox) profile. 15 tools: connection status, tab management, navigation,
page snapshot, clicking, form filling, key presses, JS evaluation, screenshots,
waiting, new windows.

**Important:** this Pi extension is installed under
`.pi/extensions/librewolf-browser/` — it is **not** a browser extension. The
browser side is a small companion WebExtension (`browser-extension/`) that the
user installs once in their everyday profile.

**⚠️ CRITICAL RULE: Never launch a LibreWolf instance. Always talk to the
already-open browser through the companion extension.** The browser is launched
normally (dock/menu, no flags, no Marionette). New windows open inside the
running profile via the extension's `windows` API — never a new process.

## Project structure

```
browser-extension/
├── manifest.json      # MV2 WebExtension (tabs, windows, scripting, <all_urls>)
└── background.js      # Long-polls the broker, executes actions, POSTs results
.pi/extensions/librewolf-browser/
├── package.json          # No runtime dependencies (plain node:http broker)
└── src/
    ├── index.ts          # Pi extension — tools + /librewolf command
    └── bridge.ts         # Localhost HTTP broker (long-poll /next, /result)
```

The repo root also has `README.md`, `CONTEXT.md`, `package.json`, `tsconfig.json`
(for builds + type checking).

## Browser setup (user, one time)

1. LibreWolf → `about:config` → `xpinstall.signatures.required = false`
2. `about:addons` → gear icon → Install Add-on From File → `browser-extension/`
   (or the packaged `librewolf-pi-bridge.xpi`)
3. Keep that LibreWolf window open. No flags, no restart needed.

## Environment variables

- `LIBREWOLF_BRIDGE_HOST` (default `127.0.0.1`)
- `LIBREWOLF_BRIDGE_PORT` (default `17319`)

## Code rules

- When adding a tool, use `defineTool` + `Type.Object` parameter schema.
- New browser capabilities go in `browser-extension/background.js` as a new
  `action` in `runAction`, plus a thin tool wrapper in `src/index.ts`.
- Everything that must appear in the `/` menu has to be a command via
  `pi.registerCommand`; tools never show in the menu, the model calls them
  (`/librewolf` prints a Pi-readable status summary and opens nothing;
  `/librewolf tab [url] | close [handle] | connect | status | tabs |
  window [url] | doctor | onboard`).
- Each tool goes through `runAction()`; never keep browser state in Pi.
- On connection failure, return a message telling the user the install steps
  (`/librewolf onboard`) in English.
- Screenshots default to dated filenames under `.pi/librewolf-screenshots/`.
- `evaluate` must return JSON-serializable values.
- All code, comments, tool/command descriptions, and user-facing messages must be in English.
- Commit every change automatically: after completing a task (or a coherent group of
  tasks), stage the related files and create a commit with a short English message.
  Do not leave changes uncommitted and do not ask for confirmation first.
