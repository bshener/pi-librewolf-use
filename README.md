# pi-librewolf-use

A Pi coding agent extension to remotely control a running LibreWolf / Firefox
instance. It is **not** a browser extension — it attaches to the already-open
browser via Selenium WebDriver + Marionette.

> Why this project? `npm:pi-chrome` (v0.15.57, `tianrendong/pi-chrome`) only
> attaches to a Chrome/Chromium profile (`chrome.debugger` + CDP,
> load-unpacked via `chrome://extensions`, `127.0.0.1:17318` bridge).
> There is no official equivalent for LibreWolf/Firefox. This repo fills that gap.

## Rule (critical)

**Never launch a new LibreWolf instance. Always attach to the already-open browser.**
The extension attaches to the running instance with `--connect-existing` semantics.

## Setup

1. Open LibreWolf → `about:config`
2. Set `marionette.enabled` = `true`
3. Note the `marionette.port` value (default `2828`)
4. Enable the Marionette listener (the `about:config` switch alone does not open
   the port) — pick one:
   - **Persistent (dock/menu launches):** `systemctl --user set-environment MOZ_MARIONETTE=1`
     (applies immediately; also add `MOZ_MARIONETTE=1` to
     `~/.config/environment.d/librewolf-marionette.conf` so it survives re-login)
   - **One-shot (terminal):** `librewolf --marionette`
5. **Fully quit LibreWolf and relaunch it** (all windows) so the listener starts.

```bash
cd ~/Documents/repos/pi-librewolf-use
pi
```

The extension loads automatically from `.pi/extensions/librewolf-browser/`.

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `LIBREWOLF_MARIONETTE_HOST` | `127.0.0.1` | Marionette host |
| `LIBREWOLF_MARIONETTE_PORT` | `2828` | `about:config` → `marionette.port` |
| `LIBREWOLF_BINARY` | auto | Binary path if needed (fallback launch only) |

## Commands (`/` menu)

| Command | What it does |
|---|---|
| `/librewolf` | Open a new window in the same profile (existing windows untouched) |
| `/librewolf connect` | Check the connection to the currently open browser |
| `/librewolf status` | Same as `connect` |
| `/librewolf tabs` | Report open tabs |
| `/librewolf window [url]` | Open a new window in the same profile (existing windows untouched) |
| `/librewolf doctor` | Diagnose port / connection issues |

> Note: the `librewolf_*` **tools** never appear in the `/` menu; the model calls
> them. Use the `/librewolf connect` command to test the connection by hand.

## Tools (model-facing)

| Tool | What it does |
|---|---|
| `librewolf_status` | Connection + browser info |
| `librewolf_tabs` | List open tabs/windows |
| `librewolf_navigate` | Navigate to a URL |
| `librewolf_back` / `librewolf_forward` / `librewolf_reload` | History + reload |
| `librewolf_snapshot` | Page summary (title + link/button overview) |
| `librewolf_click` | Click via CSS selector |
| `librewolf_type` | Focus and type text (append) |
| `librewolf_fill` | Replace an input/textarea value |
| `librewolf_press_key` | Send a key (Enter, Escape, Tab, …) |
| `librewolf_evaluate` | Run JS on the page (returns JSON) |
| `librewolf_screenshot` | Capture a screenshot to a file |
| `librewolf_window` | Open a new window in the same profile |
| `librewolf_wait_for` | Wait for a selector or JS condition |

See `AGENTS.md` for detailed agent rules and `CONTEXT.md` for session context.
