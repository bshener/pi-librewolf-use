/**
 * librewolf-browser — Pi extension.
 * Çalışan LibreWolf/Firefox'a Marionette üzerinden bağlanır.
 * Tarayıcı eklentisi DEĞİLDİR, yeni tarayıcı BAŞLATMAZ.
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
  pressKey,
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
    "Çalışan LibreWolf/Firefox bağlantısını ve aktif sayfa bilgisini döndür.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const s = await getStatus();
      return ok(`Bağlı: ${s.title} — ${s.url}`, s);
    } catch (e) {
      return err(e);
    }
  },
});

const tabsTool = defineTool({
  name: "librewolf_tabs",
  label: "LibreWolf Tabs",
  description: "Açık pencere/sekme listesini döndür.",
  parameters: Type.Object({}),
  async execute() {
    try {
      const tabs = await listTabs();
      const text = tabs
        .map((t) => `${t.active ? "*" : " "} ${t.title} — ${t.url}`)
        .join("\n");
      return ok(text || "(sekme yok)", tabs);
    } catch (e) {
      return err(e);
    }
  },
});

const navigateTool = defineTool({
  name: "librewolf_navigate",
  label: "LibreWolf Navigate",
  description: "Aktif sekmede URL'ye git.",
  parameters: Type.Object({
    url: Type.String({ description: "Gidilecek URL" }),
  }),
  async execute(_id, params) {
    try {
      const r = await navigateTo(params.url);
      return ok(`Gidildi: ${r.url}`, r);
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
        return ok(`${label} tamam`, r);
      } catch (e) {
        return err(e);
      }
    },
  });

const snapshotTool = defineTool({
  name: "librewolf_snapshot",
  label: "LibreWolf Snapshot",
  description: "Sayfanın başlık/link/buton özetini döndür.",
  parameters: Type.Object({
    limit: Type.Optional(
      Type.Number({ description: "Kategori başına en fazla öğe (varsayılan 30)" }),
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
  description: "CSS selector ile öğeye tıkla.",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector, örn. button.submit" }),
  }),
  async execute(_id, params) {
    try {
      const r = await clickSelector(params.selector);
      return ok(`Tıklandı: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const typeTool = defineTool({
  name: "librewolf_type",
  label: "LibreWolf Type",
  description: "Selectordeki alana metin yaz (mevcut içeriğe ekler).",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector" }),
    text: Type.String({ description: "Yazılacak metin" }),
  }),
  async execute(_id, params) {
    try {
      const r = await typeInto(params.selector, params.text);
      return ok(`Yazıldı: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const fillTool = defineTool({
  name: "librewolf_fill",
  label: "LibreWolf Fill",
  description: "Input/textarea değerini değiştir (önce temizler).",
  parameters: Type.Object({
    selector: Type.String({ description: "CSS selector" }),
    text: Type.String({ description: "Yeni değer" }),
  }),
  async execute(_id, params) {
    try {
      const r = await fillInto(params.selector, params.text);
      return ok(`Dolduruldu: ${params.selector}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const keyTool = defineTool({
  name: "librewolf_press_key",
  label: "LibreWolf Key",
  description: "Tuş gönder (ENTER, ESCAPE, TAB, BACKSPACE, DELETE, oklar).",
  parameters: Type.Object({
    key: Type.String({ description: "Tuş adı" }),
    selector: Type.Optional(Type.String({ description: "Opsiyonel CSS selector" })),
  }),
  async execute(_id, params) {
    try {
      const r = await pressKey(params.key, params.selector);
      return ok(`Tuş: ${params.key}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const evalTool = defineTool({
  name: "librewolf_evaluate",
  label: "LibreWolf Evaluate",
  description: "Sayfada JS çalıştır, JSON-serialize sonucu döndür.",
  parameters: Type.Object({
    script: Type.String({
      description: "JS gövdesi, örn. return document.title",
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
  description: "Ekran görüntüsü alıp dosyaya kaydet.",
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({ description: "Kayıt yolu (varsayılan .pi/librewolf-screenshots/)" }),
    ),
  }),
  async execute(_id, params) {
    try {
      const r = await takeScreenshot(params.path ?? screenshotPath());
      return ok(`Kaydedildi: ${r.path}`, r);
    } catch (e) {
      return err(e);
    }
  },
});

const waitTool = defineTool({
  name: "librewolf_wait_for",
  label: "LibreWolf Wait",
  description: "Selector ya da JS koşulu gerçekleşene kadar bekle.",
  parameters: Type.Object({
    target: Type.String({ description: "CSS selector ya da JS gövdesi" }),
    kind: Type.Optional(
      Type.String({ description: "selector | js (varsayılan selector)" }),
    ),
    timeoutMs: Type.Optional(
      Type.Number({ description: "Zaman aşımı ms (varsayılan 10000)" }),
    ),
  }),
  async execute(_id, params) {
    try {
      const kind = params.kind === "js" ? "js" : "selector";
      await waitFor(params.target, params.timeoutMs ?? 10000, kind);
      return ok("Koşul sağlandı", { target: params.target });
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
    goTool("librewolf_back", "LibreWolf Back", "Geri git.", async () => {
      const { getDriver } = await import("./firefox-client.js");
      const d = await getDriver();
      await d.navigate().back();
      return { ok: true };
    }),
  );
  pi.registerTool(
    goTool("librewolf_forward", "LibreWolf Forward", "İleri git.", async () => {
      const { getDriver } = await import("./firefox-client.js");
      const d = await getDriver();
      await d.navigate().forward();
      return { ok: true };
    }),
  );
  pi.registerTool(
    goTool("librewolf_reload", "LibreWolf Reload", "Sayfayı yenile.", async () => {
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
}
