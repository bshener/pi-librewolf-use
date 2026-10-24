# AGENTS — Project Agent Rules

## What is this project?

A Pi coding agent extension to remotely control a running LibreWolf (or Firefox)
instance. 14 tools: connection status, tab management, navigation, page snapshot,
clicking, form filling, key presses, JS evaluation, screenshots, waiting.

**Important:** this extension is installed under `.pi/extensions/librewolf-browser/` —
it is **not** a browser extension. It attaches to the running browser via the
Marionette protocol (Selenium WebDriver).

**⚠️ CRITICAL RULE: Never launch a new LibreWolf instance. Always attach to the
already-open LibreWolf/Firefox browser.** The extension attaches with
`--connect-existing` semantics, it never starts a browser.

## Project structure

```
.pi/extensions/librewolf-browser/
├── package.json          # selenium-webdriver, geckodriver
├── src/
│   ├── index.ts          # Pi extension — tool registrations
│   └── firefox-client.ts # LibreWolfClient — Selenium WebDriver wrapper
└── README.md             # Setup + usage
```

The repo root also has `README.md`, `CONTEXT.md`, `package.json`, `tsconfig.json`
(for builds + type checking).

## Browser setup

1. LibreWolf → `about:config`
2. `marionette.enabled` = `true`
3. Note the `marionette.port` value (default `2828`)
4. Enable the listener (the `about:config` switch alone does not open the port):
   persistent dock/menu launches need `MOZ_MARIONETTE=1` in the session
   environment (`systemctl --user set-environment` + `~/.config/environment.d/`);
   a one-shot terminal launch uses `librewolf --marionette`
5. Fully quit LibreWolf and relaunch it (all windows)

## Environment variables

- `LIBREWOLF_MARIONETTE_HOST` (default `127.0.0.1`)
- `LIBREWOLF_MARIONETTE_PORT` (default `2828`)
- `LIBREWOLF_BINARY` (optional, fallback launch only)

## Code rules

- When adding a tool, use `defineTool` + `Type.Object` parameter schema.
- Everything that must appear in the `/` menu has to be a command via
  `pi.registerCommand`; tools never show in the menu, the model calls them
  (`/librewolf` opens a new window; `/librewolf connect | status | tabs | window [url] | doctor`).
- Each tool shares the driver via `try/finally`, never closes it (single driver per session).
- On connection failure, return a message telling the user the `about:config` steps in English.
- Screenshots default to dated filenames under `.pi/librewolf-screenshots/`.
- `evaluate` must return JSON-serializable values.
- All code, comments, tool/command descriptions, and user-facing messages must be in English.
- Commit every change automatically: after completing a task (or a coherent group of
  tasks), stage the related files and create a commit with a short English message.
  Do not leave changes uncommitted and do not ask for confirmation first.
