/* LibreWolf Pi Bridge — background page.
 *
 * Long-polls the Pi-side broker (default http://127.0.0.1:17319) for
 * commands, executes them with WebExtension APIs, and POSTs results back.
 * Works in a completely normal LibreWolf launch: no flags, no Marionette.
 */

const BRIDGE_URL =
  (typeof BRIDGE_URL_OVERRIDE !== "undefined" && BRIDGE_URL_OVERRIDE) ||
  "http://127.0.0.1:17319";
const CLIENT_NAME = "librewolf-pi-bridge/0.1.0";
const FETCH_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 3_000;

let polling = false;

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`${label || "fetch"} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  try {
    for (;;) {
      let payload;
      try {
        const response = await fetchWithTimeout(
          `${BRIDGE_URL}/next?name=${encodeURIComponent(CLIENT_NAME)}`,
          { method: "GET" },
          FETCH_TIMEOUT_MS,
          "bridge poll",
        );
        if (!response.ok) throw new Error(`bridge HTTP ${response.status}`);
        payload = await response.json();
      } catch (error) {
        // Pi is not running (or bridge not started yet): back off and retry.
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (!payload || payload.type === "none") continue;
      if (payload.type !== "command" || !payload.command) continue;
      if (
        payload.expectedBridgeVersion &&
        !CLIENT_NAME.endsWith(payload.expectedBridgeVersion) &&
        payload.expectedBridgeVersion !== "0.0.0-dev"
      ) {
        console.warn(
          `[pi-bridge] bridge version ${payload.expectedBridgeVersion} differs from extension ${CLIENT_NAME}; consider updating the extension.`,
        );
      }
      const { command } = payload;
      let result;
      try {
        result = { id: command.id, ok: true, result: await runAction(command) };
      } catch (error) {
        result = {
          id: command.id,
          ok: false,
          error: error && error.message ? String(error.message) : String(error),
        };
      }
      try {
        await fetchWithTimeout(
          `${BRIDGE_URL}/result`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(result),
          },
          FETCH_TIMEOUT_MS,
          "bridge result",
        );
      } catch (error) {
        console.warn("[pi-bridge] failed to post result:", error);
      }
    }
  } finally {
    polling = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function activeTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) return tabs[0];
  const any = await browser.tabs.query({ active: true });
  if (any.length > 0) return any[0];
  throw new Error("no active tab");
}

async function runAction(command) {
  const { action, params } = command;
  switch (action) {
    case "status": {
      const tab = await activeTab().catch(() => null);
      const tabs = await browser.tabs.query({});
      return {
        connected: true,
        title: tab ? tab.title || "" : "",
        url: tab ? tab.url || "" : "",
        tabCount: tabs.length,
      };
    }
    case "tabs": {
      const tabs = await browser.tabs.query({});
      return tabs.map((t) => ({
        handle: String(t.id),
        windowId: t.windowId,
        active: !!t.active,
        title: t.title || "",
        url: t.url || "",
      }));
    }
    case "navigate": {
      const tab = await activeTab();
      await browser.tabs.update(tab.id, { url: params.url });
      await waitTabComplete(tab.id, 15_000).catch(() => {});
      const updated = await browser.tabs.get(tab.id).catch(() => null);
      return { url: (updated && updated.url) || params.url };
    }
    case "back": {
      const tab = await activeTab();
      await browser.tabs.goBack(tab.id).catch(() => {
        throw new Error("cannot go back");
      });
      return { ok: true };
    }
    case "forward": {
      const tab = await activeTab();
      await browser.tabs.goForward(tab.id).catch(() => {
        throw new Error("cannot go forward");
      });
      return { ok: true };
    }
    case "reload": {
      const tab = await activeTab();
      await browser.tabs.reload(tab.id);
      return { ok: true };
    }
    case "window": {
      const win = await browser.windows.create(
        params.url ? { url: params.url } : {},
      );
      const tabs = win.tabs && win.tabs[0];
      if (tabs && params.url) {
        await waitTabComplete(tabs.id, 15_000).catch(() => {});
      }
      const fresh = tabs
        ? await browser.tabs.get(tabs.id).catch(() => tabs)
        : null;
      return {
        handle: fresh ? String(fresh.id) : "",
        windowId: win.id,
        url: (fresh && fresh.url) || params.url || "about:blank",
      };
    }
    case "snapshot": {
      const tab = await activeTab();
      return runInTab(tab.id, snapshotCollectorCode(params.limit || 30));
    }
    case "click": {
      const tab = await activeTab();
      return runInTab(tab.id, clickCode(params.selector));
    }
    case "type": {
      const tab = await activeTab();
      return runInTab(tab.id, typeCode(params.selector, params.text, false));
    }
    case "fill": {
      const tab = await activeTab();
      return runInTab(tab.id, typeCode(params.selector, params.text, true));
    }
    case "pressKey": {
      const tab = await activeTab();
      return runInTab(tab.id, pressKeyCode(params.key, params.selector));
    }
    case "evaluate": {
      const tab = await activeTab();
      return runInTab(tab.id, `(() => { ${params.script} })()`);
    }
    case "screenshot": {
      const win = await browser.windows.getCurrent();
      const dataUrl = await browser.tabs.captureVisibleTab(win.id, {
        format: "png",
      });
      return { dataUrl };
    }
    case "waitFor": {
      const tab = await activeTab();
      return waitForInTab(tab, params.target, params.kind, params.timeoutMs);
    }
    default:
      throw new Error(`unknown action: ${action}`);
  }
}

async function waitTabComplete(tabId, timeoutMs) {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  if (tab.status === "complete") return;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
    const listener = (updatedId, info) => {
      if (updatedId === tabId && info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function runInTab(tabId, code) {
  let results;
  try {
    results = await browser.tabs.executeScript(tabId, {
      code,
      runAt: "document_idle",
    });
  } catch (error) {
    throw new Error(
      `cannot run script in this tab (page may restrict scripting): ${error.message || error}`,
    );
  }
  const value = results && results.length > 0 ? results[0] : undefined;
  if (value && typeof value === "object" && value.__piError) {
    throw new Error(value.__piError);
  }
  return value;
}

async function waitForInTab(tab, target, kind, timeoutMs) {
  const timeout = Number(timeoutMs) || 10_000;
  const deadline = Date.now() + timeout;
  const code =
    kind === "js"
      ? `(() => { try { return !!(() => { ${target} })(); } catch (e) { return false; } })()`
      : `(!!document.querySelector(${JSON.stringify(target)}))`;
  for (;;) {
    const met = await runInTab(tab.id, code).catch(() => false);
    if (met) return { ok: true };
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${kind}: ${target}`);
    }
    await sleep(250);
  }
}

function snapshotCollectorCode(limit) {
  return `(() => {
    const lim = ${JSON.stringify(limit)};
    const pick = (sel) => Array.from(document.querySelectorAll(sel))
      .slice(0, lim)
      .map((e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 120));
    return {
      title: document.title,
      url: location.href,
      headings: pick('h1,h2,h3'),
      links: pick('a'),
      buttons: pick('button,[role=button],input[type=submit]'),
    };
  })()`;
}

function clickCode(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { __piError: 'element not found: ' + ${JSON.stringify(selector)} };
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { clicked: ${JSON.stringify(selector)} };
  })()`;
}

function typeCode(selector, text, replace) {
  return `(() => {
    const sel = ${JSON.stringify(selector)};
    const text = ${JSON.stringify(text)};
    const el = document.querySelector(sel);
    if (!el) return { __piError: 'element not found: ' + sel };
    if (typeof el.focus === 'function') el.focus();
    const setRangeEnd = () => {
      try {
        const len = (el.value || '').length;
        if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len);
      } catch (e) {}
    };
    if (${replace ? "true" : "false"}) {
      try {
        if (typeof el.select === 'function') el.select();
        else if (typeof el.setSelectionRange === 'function') el.setSelectionRange(0, (el.value || '').length);
      } catch (e) {}
    } else {
      setRangeEnd();
    }
    let done = false;
    try {
      done = document.execCommand('insertText', false, text);
    } catch (e) { done = false; }
    if (!done) {
      try {
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) {
          desc.set.call(el, ${replace ? "true" : "false"} ? text : ((el.value || '') + text));
        } else {
          el.value = ${replace ? "true" : "false"} ? text : ((el.value || '') + text);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        return { __piError: 'cannot type into element: ' + sel };
      }
    }
    return { typed: sel };
  })()`;
}

const KEY_MAP = {
  ENTER: "Enter",
  ESCAPE: "Escape",
  TAB: "Tab",
  BACKSPACE: "Backspace",
  DELETE: "Delete",
  ARROW_UP: "ArrowUp",
  ARROW_DOWN: "ArrowDown",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  HOME: "Home",
  END: "End",
  PAGE_UP: "PageUp",
  PAGE_DOWN: "PageDown",
  SPACE: " ",
};

function pressKeyCode(key, selector) {
  return `(() => {
    const sel = ${JSON.stringify(selector || null)};
    const map = ${JSON.stringify(KEY_MAP)};
    const name = String(${JSON.stringify(key)});
    const keyValue = map[name.toUpperCase()] || name;
    const target = sel ? document.querySelector(sel) : (document.activeElement || document.body);
    if (!target) return { __piError: 'no target for key press' };
    if (sel && !document.querySelector(sel)) return { __piError: 'element not found: ' + sel };
    if (typeof target.focus === 'function') target.focus();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, { key: keyValue, bubbles: true, cancelable: true }));
    }
    return { pressed: name };
  })()`;
}

// Keep the bridge alive and polling.
void pollLoop();
