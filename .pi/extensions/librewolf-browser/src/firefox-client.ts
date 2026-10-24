/**
 * LibreWolfClient — Selenium WebDriver wrapper that connects to an
 * already-running LibreWolf/Firefox instance via Marionette.
 *
 * CRITICAL RULE: Never launch a new browser. Always attach to the
 * already-open instance with `--connect-existing` semantics.
 *
 * One-time setup (user side):
 *   about:config → marionette.enabled = true, note marionette.port.
 */

import { Socket } from "node:net";
import { Builder, By, until, type WebDriver } from "selenium-webdriver";
import * as firefox from "selenium-webdriver/firefox.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 2828;

export function marionetteHost(): string {
  return process.env.LIBREWOLF_MARIONETTE_HOST ?? DEFAULT_HOST;
}

export function marionettePort(): number {
  const raw = process.env.LIBREWOLF_MARIONETTE_PORT ?? String(DEFAULT_PORT);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

export function marionetteHint(): string {
  return (
    `Could not connect to LibreWolf (${marionetteHost()}:${marionettePort()}). ` +
    `LibreWolf must be open with marionette.enabled=true in about:config. ` +
    `Check the port via marionette.port and set the ` +
    `LIBREWOLF_MARIONETTE_PORT environment variable if needed.`
  );
}

/** Quick TCP probe of the Marionette port. Call before attempting a connection. */
export async function probeMarionette(
  timeoutMs = 3000,
): Promise<{ open: boolean; host: string; port: number }> {
  const host = marionetteHost();
  const port = marionettePort();
  const open = await new Promise<boolean>((resolve) => {
    const s = new Socket();
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
    s.connect(port, host);
  });
  return { open, host, port };
}

let sharedDriver: WebDriver | null = null;
let building: Promise<WebDriver> | null = null;

async function buildDriver(): Promise<WebDriver> {
  const options = new firefox.Options();

  const binary = process.env.LIBREWOLF_BINARY;
  if (binary) options.setBinary(binary);

  // Attach to the already-open browser. Never opens a new profile/instance.
  // LIBREWOLF_MARIONETTE_HOST/PORT are forwarded to geckodriver here;
  // without this, a custom port would be silently ignored.
  const service = new firefox.ServiceBuilder().addArguments(
    "--connect-existing",
    "--marionette-host",
    marionetteHost(),
    "--marionette-port",
    String(marionettePort()),
  );
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  return driver;
}

/** Single shared driver for the session. Never closed, always reused. */
export async function getDriver(): Promise<WebDriver> {
  if (sharedDriver) return sharedDriver;
  if (building) return building;
  building = buildDriver()
    .then((d) => {
      sharedDriver = d;
      building = null;
      return d;
    })
    .catch((e) => {
      building = null;
      throw e;
    });
  return building;
}

export async function getStatus(): Promise<{
  connected: boolean;
  title: string;
  url: string;
  host: string;
  port: number;
}> {
  const driver = await getDriver();
  const title = await driver.getTitle();
  const url = await driver.getCurrentUrl();
  return {
    connected: true,
    title,
    url,
    host: marionetteHost(),
    port: marionettePort(),
  };
}

export async function listTabs(): Promise<
  Array<{ handle: string; active: boolean; title: string; url: string }>
> {
  const driver = await getDriver();
  const current = await driver.getWindowHandle();
  const handles = await driver.getAllWindowHandles();
  const out: Array<{
    handle: string;
    active: boolean;
    title: string;
    url: string;
  }> = [];
  for (const h of handles) {
    await driver.switchTo().window(h);
    out.push({
      handle: h,
      active: h === current,
      title: await driver.getTitle().catch(() => ""),
      url: await driver.getCurrentUrl().catch(() => ""),
    });
  }
  await driver.switchTo().window(current).catch(() => undefined);
  return out;
}

export async function navigateTo(url: string): Promise<{ url: string }> {
  const driver = await getDriver();
  await driver.get(url);
  return { url: await driver.getCurrentUrl() };
}

/** Open a new window in the same profile/process without touching existing windows.
 *  Focus stays in the new window so follow-up commands act there.
 *
 *  Note: LibreWolf's Marionette build does not implement the WebDriver
 *  New Window command, so this uses window.open() with window features
 *  (which opens a real window under default link prefs). */
export async function openWindow(
  url = "about:blank",
): Promise<{ handle: string; url: string }> {
  const driver = await getDriver();
  const before = new Set(await driver.getAllWindowHandles());
  await driver.executeScript(
    "window.open(arguments[0], '_blank', 'width=1024,height=768');",
    url,
  );
  const deadline = Date.now() + 8000;
  let handle: string | undefined;
  while (Date.now() < deadline) {
    const handles = await driver.getAllWindowHandles();
    handle = handles.find((h) => !before.has(h));
    if (handle) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!handle) {
    throw new Error("Could not open a new window (popup blocked?).");
  }
  await driver.switchTo().window(handle);
  const current = await driver.getCurrentUrl().catch(() => "about:blank");
  if (current === "about:blank" && url !== "about:blank") {
    await driver.get(url);
  }
  return { handle, url: await driver.getCurrentUrl() };
}

/** Lightweight page summary: title, URL, and the first N headings, links, and buttons. */
export async function snapshot(limit = 30): Promise<string> {
  const driver = await getDriver();
  const data = await driver.executeScript(
    `const lim = arguments[0];
     const pick = (sel) => Array.from(document.querySelectorAll(sel))
       .slice(0, lim)
       .map((e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 120));
     return {
       title: document.title,
       url: location.href,
       headings: pick('h1,h2,h3'),
       links: pick('a'),
       buttons: pick('button,[role=button],input[type=submit]'),
     };`,
    limit,
  );
  const d = data as {
    title: string;
    url: string;
    headings: string[];
    links: string[];
    buttons: string[];
  };
  const lines = [`# ${d.title}`, d.url, ""];
  if (d.headings.length) {
    lines.push("## Headings");
    for (const h of d.headings) lines.push(`- ${h}`);
    lines.push("");
  }
  if (d.links.length) {
    lines.push("## Links");
    for (const l of d.links) lines.push(`- ${l}`);
    lines.push("");
  }
  if (d.buttons.length) {
    lines.push("## Buttons");
    for (const b of d.buttons) lines.push(`- ${b}`);
  }
  return lines.join("\n");
}

export async function clickSelector(
  selector: string,
  timeoutMs = 8000,
): Promise<{ clicked: string }> {
  const driver = await getDriver();
  const el = await driver.wait(
    until.elementLocated(By.css(selector)),
    timeoutMs,
  );
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  await el.click();
  return { clicked: selector };
}

export async function typeInto(
  selector: string,
  text: string,
  timeoutMs = 8000,
): Promise<{ typed: string }> {
  const driver = await getDriver();
  const el = await driver.wait(
    until.elementLocated(By.css(selector)),
    timeoutMs,
  );
  await el.sendKeys(text);
  return { typed: selector };
}

export async function fillInto(
  selector: string,
  text: string,
  timeoutMs = 8000,
): Promise<{ filled: string }> {
  const driver = await getDriver();
  const el = await driver.wait(
    until.elementLocated(By.css(selector)),
    timeoutMs,
  );
  await el.clear();
  await el.sendKeys(text);
  return { filled: selector };
}

const KEY_MAP: Record<string, string> = {
  ENTER: "\uE007",
  ESCAPE: "\uE00C",
  TAB: "\uE004",
  BACKSPACE: "\uE003",
  DELETE: "\uE017",
  ARROW_UP: "\uE013",
  ARROW_DOWN: "\uE015",
  ARROW_LEFT: "\uE012",
  ARROW_RIGHT: "\uE014",
};

export async function pressKey(
  key: string,
  selector?: string,
): Promise<{ pressed: string }> {
  const driver = await getDriver();
  const code = KEY_MAP[key.toUpperCase()] ?? key;
  if (selector) {
    const el = await driver.wait(
      until.elementLocated(By.css(selector)),
      8000,
    );
    await el.sendKeys(code);
  } else {
    await driver.switchTo().activeElement().then((el) => el.sendKeys(code));
  }
  return { pressed: key };
}

export async function evaluate(
  script: string,
): Promise<{ value: unknown }> {
  const driver = await getDriver();
  const value = await driver.executeScript(
    `return (() => { ${script} })();`,
  );
  return { value };
}

export async function takeScreenshot(absPath: string): Promise<{
  path: string;
}> {
  const driver = await getDriver();
  const base64 = await driver.takeScreenshot();
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, Buffer.from(base64, "base64"));
  return { path: absPath };
}

export async function waitFor(
  selectorOrJs: string,
  timeoutMs = 10000,
  kind: "selector" | "js" = "selector",
): Promise<{ ok: boolean }> {
  const driver = await getDriver();
  if (kind === "js") {
    await driver.wait(async () => {
      const v = await driver.executeScript(
        `return Boolean((() => { ${selectorOrJs} })());`,
      );
      return v === true;
    }, timeoutMs);
  } else {
    await driver.wait(
      until.elementLocated(By.css(selectorOrJs)),
      timeoutMs,
    );
  }
  return { ok: true };
}
