# pi-librewolf-use

A Pi coding agent extension to remotely control the user's normal LibreWolf /
Firefox. It is **not** a browser extension and it launches **nothing** — a tiny
companion WebExtension inside your everyday profile talks to a machine-local
bridge hosted by the Pi extension itself.

> Why this project? `npm:pi-chrome` (v0.15.57, `tianrendong/pi-chrome`) only
> attaches to a Chrome/Chromium profile (`chrome.debugger` + CDP,
> load-unpacked via `chrome://extensions`, `127.0.0.1:17318` bridge).
> There is no official equivalent for LibreWolf/Firefox. This repo fills that gap
> with the same proven shape: companion extension + localhost broker.

## Rule (critical)

**Never launch a LibreWolf instance.** The browser stays exactly as the user
left it — normal dock/menu launch, no flags, no Marionette. Pi only *talks* to
it through the companion extension. Opening a new window happens inside the
running profile via the extension's `windows` API.

## How it works

```text
LibreWolf (normal launch, your profile)
 └─ "LibreWolf Pi Bridge" WebExtension (background page)
     │  long-polls GET /next, POSTs /result
     ▼
Pi extension → localhost HTTP broker (default 127.0.0.1:17319)
 └─ librewolf_* tools + /librewolf command
```

## Setup (one time)

1. LibreWolf → `about:config` → set `xpinstall.signatures.required = false`
   (LibreWolf honors this, unlike stock Firefox Release).
2. Install the companion extension (no restart needed):
   `about:addons` → gear icon → **Install Add-on From File** → pick
   `browser-extension/` from this repo (select its `manifest.json` via
   *Load Temporary Add-on* under `about:debugging` for a quick trial, or the
   packaged `librewolf-pi-bridge.xpi` for a permanent install).
3. Keep that LibreWolf window open and start Pi in this directory:

```bash
cd ~/Documents/repos/pi-librewolf-use
pi
```

The Pi extension loads from `.pi/extensions/pi-librewolf-use/` and starts the
broker automatically. Verify with `/librewolf doctor`.

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `LIBREWOLF_BRIDGE_HOST` | `127.0.0.1` | Broker bind host |
| `LIBREWOLF_BRIDGE_PORT` | `17319` | Broker port (17318 is pi-chrome's) |

## Commands (`/` menu)

| Command | What it does |
|---|---|
| `/librewolf` | Show a Pi-readable status summary (opens nothing) |
| `/librewolf tab [url]` | Open a new tab in the current window |
| `/librewolf close [handle]` | Close a tab by its handle |
| `/librewolf connect` | Same as bare `/librewolf` |
| `/librewolf status` | Same as bare `/librewolf` |
| `/librewolf tabs` | Report open tabs |
| `/librewolf window [url]` | Open a new window, optionally at a URL |
| `/librewolf doctor` | Diagnose bridge / extension connection |
| `/librewolf onboard` | Print the install steps |

> Note: the `librewolf_*` **tools** never appear in the `/` menu; the model calls
> them. Use `/librewolf` to test the connection by hand.

## Tools (model-facing)

| Tool | What it does |
|---|---|
| `librewolf_status` | Connection + browser info |
| `librewolf_tabs` | List open tabs/windows |
| `librewolf_navigate` | Navigate the active tab (waits for load) |
| `librewolf_back` / `librewolf_forward` / `librewolf_reload` | History + reload |
| `librewolf_snapshot` | Page summary (title + headings/links/buttons) |
| `librewolf_click` | Click via CSS selector |
| `librewolf_type` | Type into a field (append) |
| `librewolf_fill` | Replace an input/textarea value |
| `librewolf_press_key` | Send a key (Enter, Escape, Tab, …) |
| `librewolf_evaluate` | Run JS on the page (returns JSON) |
| `librewolf_screenshot` | Capture a screenshot to a file |
| `librewolf_wait_for` | Wait for a selector or JS condition |
| `librewolf_window` | Open a new window in the same profile |
| `librewolf_tab` | Open a new tab in the current window |
| `librewolf_close_tab` | Close a tab by its handle |

See `AGENTS.md` for detailed agent rules and `CONTEXT.md` for session context.
