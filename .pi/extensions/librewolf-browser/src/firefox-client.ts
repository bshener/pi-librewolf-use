/**
 * LibreWolfClient — çalışan bir LibreWolf/Firefox örneğine Marionette
 * üzerinden bağlanan Selenium WebDriver sarmalayıcı.
 *
 * KRİTİK KURAL: Asla yeni tarayıcı başlatma. Hep zaten açık olan
 * instance'a `--connect-existing` mantığıyla attach ol.
 *
 * Kurulum (kullanıcı tarafında bir kez):
 *   about:config → marionette.enabled = true, marionette.port not edilir.
 */

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
    `LibreWolf'a bağlanılamadı (${marionetteHost()}:${marionettePort()}). ` +
    `LibreWolf açık olmalı ve about:config içinde marionette.enabled=true ` +
    `olmalı. Portu marionette.port değerinden kontrol et, ` +
    `gerekirse LIBREWOLF_MARIONETTE_PORT ortam değişkenini ayarla.`
  );
}

let sharedDriver: WebDriver | null = null;
let building: Promise<WebDriver> | null = null;

async function buildDriver(): Promise<WebDriver> {
  const options = new firefox.Options();

  const binary = process.env.LIBREWOLF_BINARY;
  if (binary) options.setBinary(binary);

  // Zaten açık olan tarayıcıya bağlan. Yeni profil/instance açılmaz.
  const service = new firefox.ServiceBuilder().addArguments(
    "--connect-existing",
  );

  // Marionette portunu geckodriver'a bildir.
  // (geckodriver --connect-existing ile çalışan instance'a attach olur.)
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  return driver;
}

/** Session boyunca paylaşılan tek driver. Kapatılmaz, tekrar kullanılır. */
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

/** Sayfanın hafif özeti: başlık, URL, başlıklar, link ve butonların ilk N tanesi. */
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
    lines.push("## Başlıklar");
    for (const h of d.headings) lines.push(`- ${h}`);
    lines.push("");
  }
  if (d.links.length) {
    lines.push("## Linkler");
    for (const l of d.links) lines.push(`- ${l}`);
    lines.push("");
  }
  if (d.buttons.length) {
    lines.push("## Butonlar");
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
