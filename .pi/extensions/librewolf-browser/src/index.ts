/**
 * librewolf-browser — Pi extension.
 * Controls the user's normal LibreWolf/Firefox through the companion
 * "LibreWolf Pi Bridge" WebExtension and a machine-local HTTP broker.
 * NOT a browser extension itself, does NOT launch a browser, needs
 * NO flags and NO Marionette: the browser stays completely normal.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
  bridgeHint,
  bridgeHost,
  bridgePort,
  getBridge,
  runAction,
} from "./bridge.js";

function ok(text: string, details?: unknown) {
  return {
    content: [{ type: "text", text } as const],
    details: details ?? { text },
  };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text", text: `${msg}\n\n${bridgeHint()}` } as const],
    details: { error: msg },
    isError: true as const,
  };
}

function screenshotPath(): string {
  const dir = join(process.cwd(), ".pi", "librewolf-screenshots");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(dir, `librewolf-${stamp}.png`);
}

const statusTool = defineTool({
  name: "librewolf_status",
  label: "LibreWolf Status",
  description:
    "Connection status of the running LibreWolf and the active page info.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const s = (await runAction("status")) as {
        title: string;
        url: string;
        tabCount: number;
      };
      return ok(`Connected: ${s.title || "(untitled)"} — ${s.url}`, s);
    } catch (e) {
      return err(e);
    }
  },
});

const tabsTool = defineTool({
  name: "librewolf_tabs",
  label: "LibreWolf Tabs",
  description: "List open tabs/windows.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const tabs = (await runAction("tabs")) as Array<{
        handle: string;
        active: boolean;
        title: string;
        url: string;
      }>;
      const text = tabs
        .map((t) => `${t.active ? "*" : " "} ${t.title || "(untitled)"} — ${t.url}`)
        .join("\n");
      return ok(text || "(no tabs)", tabs);
    } catch (e) {
      return err(e);
    }
  },
});

const navigateTool = defineTool({
  name: "librewolf_navigate",
  label: "LibreWolf Navigate",
  description: "Navigate the active tab to a URL.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to navigate to" }),
  }),
  async execute(_id, params) {
    try {
      const r = (await runAction("navigate", { url: params.url })) as {
        url: string;
      };
      return ok(`Navigated: ${r.url}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const goTool = (
  name: string,
  label: string,
  desc: string,
  action: "back" | "forward" | "reload",
) =>
  defineTool({
    name,
    label,
    description: desc,
    parameters: Type.Object({}),
    async execute() {
      try {
        const r = await runAction(action);
        return ok(`${label} done`, r);
      } catch (e) {
        return err(e);
      }
    },
  });

const snapshotTool = defineTool({
  name: "librewolf_snapshot",
  label: "LibreWolf Snapshot",
  description: "Return a title/link/button summary of the page.",
  parameters: Type.Object({
    limit: Type.Optional(
      Type.Number({ description: "Max items per category (default 30)" }),
    ),
  }),
  async execute(_id, params) {
    try {
      const data = (await runAction("snapshot", {
        limit: params.limit ?? 30,
      })) as {
        title: string;
        url: string;
        headings: string[];
        links: string[];
        buttons: string[];
      };
      const lines = [`# ${data.title || "(untitled)"}`, data.url, ""];
      if (data.headings?.length) {
        lines.push("## Headings");
        for (const h of data.headings) lines.push(`- ${h}`);
        lines.push("");
      }
      if (data.links?.length) {
        lines.push("## Links");
        for (const l of data.links) lines.push(`- ${l}`);
        lines.push("");
      }
      if (data.buttons?.length) {
        lines.push("## Buttons");
        for (const b of data.buttons) lines.push(`- ${b}`);
      }
      const text = lines.join("\n");
      return ok(text, { text });
    } catch (e) {
      return err(e);
    }
  },
});

const clickTool = defineTool({
  name: "librewolf_click",
  label: "LibreWolf Click",
  description: "Click an element by CSS selector.",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector, e.g. button.submit" }),
  }),
  async execute(_id, params) {
    try {
      const r = await runAction("click", { selector: params.selector });
      return ok(`Clicked: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const typeTool = defineTool({
  name: "librewolf_type",
  label: "LibreWolf Type",
  description: "Type text into the field at the selector (appends to existing content).",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector" }),
    text: Type.String({ description: "Text to type" }),
  }),
  async execute(_id, params) {
    try {
      const r = await runAction("type", {
        selector: params.selector,
        text: params.text,
      });
      return ok(`Typed: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const fillTool = defineTool({
  name: "librewolf_fill",
  label: "LibreWolf Fill",
  description: "Replace an input/textarea value (clears first).",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector" }),
    text: Type.String({ description: "New value" }),
  }),
  async execute(_id, params) {
    try {
      const r = await runAction("fill", {
        selector: params.selector,
        text: params.text,
      });
      return ok(`Filled: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const keyTool = defineTool({
  name: "librewolf_press_key",
  label: "LibreWolf Key",
  description: "Send a key (ENTER, ESCAPE, TAB, BACKSPACE, DELETE, arrows).",
  parameters: Type.Object({
    key: Type.String({ description: "Key name" }),
    selector: Type.Optional(Type.String({ description: "Optional CSS selector" })),
  }),
  async execute(_id, params) {
    try {
      const r = await runAction("pressKey", {
        key: params.key,
        selector: params.selector ?? null,
      });
      return ok(`Key: ${params.key}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const evalTool = defineTool({
  name: "librewolf_evaluate",
  label: "LibreWolf Evaluate",
  description: "Run JS on the page, return a JSON-serializable result.",
  parameters: Type.Object({
    script: Type.String({
      description: "JS body, e.g. return document.title",
    }),
  }),
  async execute(_id, params) {
    try {
      const value = await runAction("evaluate", { script: params.script });
      return ok(JSON.stringify(value) ?? "undefined", { value });
    } catch (e) {
      return err(e);
    }
  },
});

const shotTool = defineTool({
  name: "librewolf_screenshot",
  label: "LibreWolf Screenshot",
  description: "Take a screenshot and save it to a file.",
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({
        description: "Save path (default .pi/librewolf-screenshots/)",
      }),
    ),
  }),
  async execute(_id, params) {
    try {
      const r = (await runAction("screenshot")) as { dataUrl: string };
      const path = params.path ?? screenshotPath();
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      const base64 = r.dataUrl.includes(",")
        ? r.dataUrl.split(",")[1]
        : r.dataUrl;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(base64, "base64"));
      return ok(`Saved: ${path}`, { path });
    } catch (e) {
      return err(e);
    }
  },
});

const waitTool = defineTool({
  name: "librewolf_wait_for",
  label: "LibreWolf Wait",
  description: "Wait until a selector or JS condition holds.",
  parameters: Type.Object({
    target: Type.String({ description: "CSS selector or JS body" }),
    kind: Type.Optional(
      Type.String({ description: "selector | js (default selector)" }),
    ),
    timeoutMs: Type.Optional(
      Type.Number({ description: "Timeout in ms (default 10000)" }),
    ),
  }),
  async execute(_id, params) {
    try {
      const kind = params.kind === "js" ? "js" : "selector";
      await runAction("waitFor", {
        target: params.target,
        kind,
        timeoutMs: params.timeoutMs ?? 10_000,
      });
      return ok("Condition met", { target: params.target });
    } catch (e) {
      return err(e);
    }
  },
});

const tabTool = defineTool({
  name: "librewolf_tab",
  label: "LibreWolf Tab",
  description:
    "Open a new tab in the current window without touching existing tabs.",
  parameters: Type.Object({
    url: Type.Optional(Type.String({ description: "URL to open (default about:blank)" })),
  }),
  async execute(_id, params) {
    try {
      const r = (await runAction("tab", { url: params.url ?? null })) as {
        url: string;
      };
      return ok(`Tab opened: ${r.url}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const closeTabTool = defineTool({
  name: "librewolf_close_tab",
  label: "LibreWolf Close Tab",
  description: "Close a tab by its handle (see librewolf_tabs).",
  parameters: Type.Object({
    handle: Type.String({ description: "Tab handle to close" }),
  }),
  async execute(_id, params) {
    try {
      const r = await runAction("closeTab", { handle: params.handle });
      return ok(`Tab closed: ${params.handle}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const windowTool = defineTool({
  name: "librewolf_window",
  label: "LibreWolf Window",
  description:
    "Open a new window in the same profile without touching existing windows.",
  parameters: Type.Object({
    url: Type.Optional(Type.String({ description: "URL to open (default about:blank)" })),
  }),
  async execute(_id, params) {
    try {
      const r = (await runAction("window", { url: params.url ?? null })) as {
        url: string;
      };
      return ok(`Window opened: ${r.url}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

function onboardText(): string {
  return [
    "To connect Pi to your normal LibreWolf:",
    "1. LibreWolf → about:config → set xpinstall.signatures.required = false",
    "2. Install the companion extension: open about:addons → gear icon →",
    "   Install Add-on From File → pick browser-extension/ from this repo",
    "   (or the packaged librewolf-pi-bridge.xpi)",
    "3. Keep that LibreWolf window open — no flags, no restart needed.",
    "Then run /librewolf connect.",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(statusTool);
  pi.registerTool(tabsTool);
  pi.registerTool(navigateTool);
  pi.registerTool(goTool("librewolf_back", "LibreWolf Back", "Go back.", "back"));
  pi.registerTool(
    goTool("librewolf_forward", "LibreWolf Forward", "Go forward.", "forward"),
  );
  pi.registerTool(
    goTool("librewolf_reload", "LibreWolf Reload", "Reload the page.", "reload"),
  );
  pi.registerTool(snapshotTool);
  pi.registerTool(clickTool);
  pi.registerTool(typeTool);
  pi.registerTool(fillTool);
  pi.registerTool(keyTool);
  pi.registerTool(evalTool);
  pi.registerTool(shotTool);
  pi.registerTool(waitTool);
  pi.registerTool(windowTool);
  pi.registerTool(tabTool);
  pi.registerTool(closeTabTool);
  pi.registerCommand("librewolf", {
    description:
      "LibreWolf: /librewolf opens a new window | tab [url] | close [handle] | connect | status | tabs | window [url] | doctor | onboard.",
    async handler(args, ctx) {
      const notify = (msg: string, type?: "info" | "warning" | "error") =>
        ctx.ui.notify(msg, type ?? "info");
      const trimmed = args.trim();
      // Bare /librewolf opens a new window in the same profile.
      if (!trimmed) {
        try {
          const r = (await runAction("window", { url: null })) as {
            url: string;
          };
          notify(`New window: ${r.url}`);
        } catch (e) {
          notify(`LibreWolf error: ${(e as Error).message.split("\n")[0]}`, "error");
        }
        return;
      }
      const parts = trimmed.split(/\s+/);
      const sub = (parts[0] ?? "connect").toLowerCase();
      const rest = parts.slice(1).join(" ");
      try {
        if (sub === "onboard") {
          notify(onboardText());
          return;
        }
        if (sub === "doctor") {
          const bridge = getBridge();
          await bridge.ensureStarted();
          const st = bridge.connectionState;
          notify(
            `Bridge ${bridgeHost()}:${bridgePort()} (${st.mode ?? "stopped"}) → extension ${st.extensionConnected ? "connected" : "not connected"}` +
              (st.lastSeenAgoMs !== undefined
                ? ` (last seen ${Math.round(st.lastSeenAgoMs / 1000)}s ago)`
                : " (never seen)") +
              (st.extensionConnected ? "" : "; run /librewolf onboard"),
            st.extensionConnected ? "info" : "warning",
          );
          try {
            const s = (await runAction("status")) as {
              title: string;
              url: string;
              tabCount: number;
            };
            notify(
              `Connection OK: ${s.title || "(untitled)"} — ${s.url} · ${s.tabCount} tabs`,
            );
          } catch (e) {
            notify(
              `Connection error: ${(e as Error).message.split("\n")[0]}`,
              "error",
            );
          }
          return;
        }
        if (sub === "status" || sub === "connect") {
          const s = (await runAction("status")) as {
            title: string;
            url: string;
            tabCount: number;
          };
          notify(
            `Connected (${bridgeHost()}:${bridgePort()}): ${s.title || "(untitled)"} — ${s.url} · ${s.tabCount} tabs`,
          );
          return;
        }
        if (sub === "tabs") {
          const tabs = (await runAction("tabs")) as Array<{
            handle: string;
            active: boolean;
            title: string;
            url: string;
          }>;
          notify(
            tabs.length
              ? tabs
                  .map((t) => `${t.active ? "*" : " "} ${t.title || "(untitled)"} — ${t.url}`)
                  .join("\n")
              : "(no tabs)",
          );
          return;
        }
        if (sub === "window") {
          const r = (await runAction("window", {
            url: rest || null,
          })) as { url: string };
          notify(`New window: ${r.url}`);
          return;
        }
        if (sub === "tab") {
          const r = (await runAction("tab", {
            url: rest || null,
          })) as { url: string };
          notify(`New tab: ${r.url}`);
          return;
        }
        if (sub === "close") {
          if (!rest) {
            notify("Usage: /librewolf close [tab handle] (see /librewolf tabs)", "warning");
            return;
          }
          await runAction("closeTab", { handle: rest });
          notify(`Tab closed: ${rest}`);
          return;
        }
        notify(
          "Usage: /librewolf | tab [url] | close [handle] | connect | status | tabs | window [url] | doctor | onboard",
          "warning",
        );
      } catch (e) {
        notify(`LibreWolf error: ${(e as Error).message.split("\n")[0]}`, "error");
      }
    },
  });
  pi.on("session_shutdown", () => {
    getBridge().stop();
  });
}
