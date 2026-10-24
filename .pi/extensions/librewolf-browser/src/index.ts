/**
 * librewolf-browser — Pi extension.
 * Connects to a running LibreWolf/Firefox via Marionette.
 * NOT a browser extension, does NOT launch a new browser.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
  clickSelector,
  evaluate,
  fillInto,
  getStatus,
  listTabs,
  marionetteHint,
  navigateTo,
  openWindow,
  pressKey,
  probeMarionette,
  snapshot,
  takeScreenshot,
  typeInto,
  waitFor,
} from "./firefox-client.js";

function ok(text: string, details?: unknown) {
  return {
    content: [{ type: "text", text } as const],
    details: details ?? { text },
  };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text", text: `${msg}\n\n${marionetteHint()}` } as const],
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
    "Connection status of the running LibreWolf/Firefox and the active page info.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const s = await getStatus();
      return ok(`Connected: ${s.title} — ${s.url}`, s);
    } catch (e) {
      return err(e);
    }
  },
});

const tabsTool = defineTool({
  name: "librewolf_tabs",
  label: "LibreWolf Tabs",
  description: "List open windows/tabs.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const tabs = await listTabs();
      const text = tabs
        .map((t) => `${t.active ? "*" : " "} ${t.title} — ${t.url}`)
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
      const r = await navigateTo(params.url);
      return ok(`Navigated: ${r.url}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const goTool = (name: string, label: string, desc: string, fn: () => Promise<unknown>) =>
  defineTool({
    name,
    label,
    description: desc,
    parameters: Type.Object({}),
    async execute() {
      try {
        const r = await fn();
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
      const text = await snapshot(params.limit ?? 30);
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
      const r = await clickSelector(params.selector);
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
      const r = await typeInto(params.selector, params.text);
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
      const r = await fillInto(params.selector, params.text);
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
      const r = await pressKey(params.key, params.selector);
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
      const r = await evaluate(params.script);
      return ok(JSON.stringify(r.value) ?? "undefined", r);
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
      Type.String({ description: "Save path (default .pi/librewolf-screenshots/)" }),
    ),
  }),
  async execute(_id, params) {
    try {
      const r = await takeScreenshot(params.path ?? screenshotPath());
      return ok(`Saved: ${r.path}`, r);
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
      const r = await openWindow(params.url);
      return ok(`Window opened: ${r.url}`, r);
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
      await waitFor(params.target, params.timeoutMs ?? 10000, kind);
      return ok("Condition met", { target: params.target });
    } catch (e) {
      return err(e);
    }
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(statusTool);
  pi.registerTool(tabsTool);
  pi.registerTool(navigateTool);
  pi.registerTool(
    goTool("librewolf_back", "LibreWolf Back", "Go back.", async () => {
      const { getDriver } = await import("./firefox-client.js");
      const d = await getDriver();
      await d.navigate().back();
      return { ok: true };
    }),
  );
  pi.registerTool(
    goTool("librewolf_forward", "LibreWolf Forward", "Go forward.", async () => {
      const { getDriver } = await import("./firefox-client.js");
      const d = await getDriver();
      await d.navigate().forward();
      return { ok: true };
    }),
  );
  pi.registerTool(
    goTool("librewolf_reload", "LibreWolf Reload", "Reload the page.", async () => {
      const { getDriver } = await import("./firefox-client.js");
      const d = await getDriver();
      await d.navigate().refresh();
      return { ok: true };
    }),
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
  pi.registerCommand("librewolf", {
    description:
      "LibreWolf: /librewolf opens a new window | connect | status | tabs | window [url] | doctor.",
    async handler(args, ctx) {
      const notify = (msg: string, type?: "info" | "warning" | "error") =>
        ctx.ui.notify(msg, type ?? "info");
      const trimmed = args.trim();
      // Bare /librewolf opens a new window in the same profile.
      if (!trimmed) {
        try {
          const r = await openWindow(undefined);
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
        if (sub === "doctor") {
          const probe = await probeMarionette();
          notify(
            `Marionette ${probe.host}:${probe.port} → ${probe.open ? "open" : "closed"}` +
              (probe.open ? "" : "; restart LibreWolf with the --marionette flag"),
            probe.open ? "info" : "warning",
          );
          try {
            const s = await getStatus();
            const tabs = await listTabs();
            notify(`Connection OK: ${s.title || "(untitled)"} — ${s.url} · ${tabs.length} tab(s)`);
          } catch (e) {
            notify(`Connection error: ${(e as Error).message.split("\n")[0]}`, "error");
          }
          return;
        }
        if (sub === "window") {
          const r = await openWindow(rest || undefined);
          notify(`New window: ${r.url}`);
          return;
        }
        if (sub === "tabs") {
          const tabs = await listTabs();
          notify(
            tabs.length
              ? tabs.map((t) => `${t.active ? "*" : " "} ${t.title || "(untitled)"} — ${t.url}`).join("\n")
              : "(no tabs)",
          );
          return;
        }
        // connect | status (default is connect)
        const probe = await probeMarionette();
        if (!probe.open) {
          notify(
            `Marionette is closed (${probe.host}:${probe.port}). Restart LibreWolf with the --marionette flag; see /librewolf doctor for details`,
            "error",
          );
          return;
        }
        const s = await getStatus();
        const tabs = await listTabs();
        notify(
          `Connected (${probe.host}:${probe.port}): ${s.title || "(untitled)"} — ${s.url} · ${tabs.length} tab(s)`,
        );
      } catch (e) {
        notify(`LibreWolf error: ${(e as Error).message.split("\n")[0]}`, "error");
      }
    },
  });
}
