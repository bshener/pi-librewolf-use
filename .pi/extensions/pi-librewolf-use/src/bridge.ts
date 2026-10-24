/**
 * LibreWolfBridge — machine-local HTTP broker between this Pi extension
 * and the "LibreWolf Pi Bridge" WebExtension running in the user's
 * normal LibreWolf profile.
 *
 * The browser needs NO flags, NO Marionette, NO special launch: it just
 * needs the companion extension installed (about:config
 * xpinstall.signatures.required=false + Install Add-on From File).
 *
 * Mechanics (same shape as pi-chrome's proven profile bridge):
 * - This class owns a localhost HTTP server (default 127.0.0.1:17319).
 * - The extension long-polls GET /next (held up to 25s) for commands,
 *   executes them with WebExtension APIs, and POSTs results to /result.
 * - Tools call runAction(); pending commands time out with a diagnosis
 *   that distinguishes "extension not polling" from "result never posted".
 * - If another Pi session already owns the port, we run as a client and
 *   forward through its POST /command endpoint.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type BridgeCommand = {
  id: string;
  action: string;
  params: Record<string, unknown>;
};

type PendingCommand = {
  command: BridgeCommand;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  deliveredAt?: number;
};

export type BridgeResult = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

function readBridgeVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf8"),
    ) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore
  }
  return "0.0.0-dev";
}

export function bridgeHost(): string {
  return process.env.LIBREWOLF_BRIDGE_HOST ?? "127.0.0.1";
}

export function bridgePort(): number {
  const raw = process.env.LIBREWOLF_BRIDGE_PORT ?? "17319";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 17319;
}

export function bridgeHint(): string {
  return (
    `Could not reach LibreWolf (${bridgeHost()}:${bridgePort()}). ` +
    `Make sure the "LibreWolf Pi Bridge" extension is installed in your normal ` +
    `LibreWolf profile and that browser window is open. ` +
    `Run /librewolf onboard for install steps.`
  );
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(extraHeaders ?? {}),
  });
  response.end(JSON.stringify(body));
}

function extensionOrigin(request: IncomingMessage): string {
  return String(request.headers.origin ?? "");
}

function corsHeadersFor(request: IncomingMessage): Record<string, string> {
  const origin = extensionOrigin(request);
  if (
    !origin.startsWith("moz-extension://") &&
    !origin.startsWith("chrome-extension://")
  ) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function isBrowserOriginAllowed(request: IncomingMessage): boolean {
  const origin = extensionOrigin(request);
  if (origin) {
    return (
      origin.startsWith("moz-extension://") ||
      origin.startsWith("chrome-extension://")
    );
  }
  const secFetchSite = String(request.headers["sec-fetch-site"] ?? "");
  return !secFetchSite || secFetchSite === "none" || secFetchSite === "same-origin";
}

function isLocalProcessRequest(request: IncomingMessage): boolean {
  return !request.headers.origin && !request.headers["sec-fetch-site"];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_POLL_MS = 25_000;

class LibreWolfBridge {
  private server: Server | undefined;
  private pending = new Map<string, PendingCommand>();
  private queue: BridgeCommand[] = [];
  private waiters: Array<(command: BridgeCommand | undefined) => void> = [];
  private lastSeenAt: number | undefined;
  private clientName: string | undefined;
  private mode: "server" | "client" | undefined;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  get connectionState(): {
    mode: string | undefined;
    extensionConnected: boolean;
    lastSeenAgoMs: number | undefined;
    pending: number;
    queued: number;
  } {
    const ago =
      this.lastSeenAt === undefined ? undefined : Date.now() - this.lastSeenAt;
    return {
      mode: this.mode,
      extensionConnected: ago !== undefined && ago < 60_000,
      lastSeenAgoMs: ago,
      pending: this.pending.size,
      queued: this.queue.length,
    };
  }

  /** Start the broker (idempotent). Never throws for EADDRINUSE. */
  async ensureStarted(): Promise<void> {
    if (this.mode) return;
    if (this.starting) return this.starting;
    this.starting = this.bindServerOrClient().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async bindServerOrClient(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        sendJson(response, 500, { error: (error as Error).message });
      });
    });
    try {
      await new Promise<void>((resolveStart, rejectStart) => {
        server.once("error", rejectStart);
        server.listen(this.port, this.host, () => {
          server.off("error", rejectStart);
          resolveStart();
        });
      });
      this.server = server;
      this.mode = "server";
    } catch (error) {
      server.close();
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      // Another Pi session owns the port: forward through it.
      this.mode = "client";
    }
  }

  private async tryPromoteToServer(): Promise<boolean> {
    if (this.mode !== "client") return this.mode === "server";
    this.mode = undefined;
    await this.ensureStarted();
    return this.mode === "server";
  }

  stop(): void {
    if (this.mode === "client") {
      this.mode = undefined;
      return;
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("LibreWolf bridge stopped"));
    }
    this.pending.clear();
    this.queue = [];
    for (const waiter of this.waiters) waiter(undefined);
    this.waiters = [];
    this.server?.close();
    this.server = undefined;
    this.mode = undefined;
  }

  status(): Record<string, unknown> {
    return {
      bridge: "librewolf-pi-bridge",
      version: readBridgeVersion(),
      host: this.host,
      port: this.port,
      url: this.url,
      mode: this.mode ?? "stopped",
      clientName: this.clientName ?? null,
      extensionConnected: this.connectionState.extensionConnected,
      lastSeenAgoMs: this.connectionState.lastSeenAgoMs ?? null,
      pending: this.pending.size,
      queued: this.queue.length,
    };
  }

  async runAction(
    action: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.ensureStarted();
    if (this.mode === "client") {
      const alive = await this.tryPromoteToServer().catch(() => false);
      if (!alive && this.mode === "client") {
        return this.sendViaOwner(action, params, timeoutMs, signal);
      }
    }
    return this.sendLocal(action, params, timeoutMs, signal);
  }

  private sendLocal(
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const command: BridgeCommand = { id, action, params };
    return new Promise((resolveCommand, rejectCommand) => {
      if (signal?.aborted) {
        rejectCommand(new Error("LibreWolf command aborted"));
        return;
      }
      const cleanupAbort = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        this.queue = this.queue.filter((queued) => queued.id !== id);
        cleanupAbort();
        rejectCommand(new Error("LibreWolf command aborted"));
      };
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        this.pending.delete(id);
        this.queue = this.queue.filter((queued) => queued.id !== id);
        cleanupAbort();
        rejectCommand(new Error(this.timeoutMessage(entry, timeoutMs)));
      }, timeoutMs);
      this.pending.set(id, {
        command,
        resolve: (value) => {
          cleanupAbort();
          resolveCommand(value);
        },
        reject: (err) => {
          cleanupAbort();
          rejectCommand(err);
        },
        timer,
      });
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      this.enqueue(command);
    });
  }

  private timeoutMessage(
    entry: PendingCommand | undefined,
    timeoutMs: number,
  ): string {
    const pollAgeMs =
      this.lastSeenAt === undefined ? undefined : Date.now() - this.lastSeenAt;
    if (entry?.deliveredAt) {
      return (
        `Timed out after ${timeoutMs}ms: the LibreWolf extension received the ` +
        `command but never returned a result. Run /librewolf doctor; if it ` +
        `persists, reload the extension at about:addons.`
      );
    }
    if (pollAgeMs === undefined || pollAgeMs > 60_000) {
      return (
        `Timed out after ${timeoutMs}ms: the LibreWolf extension is not polling ` +
        `(last seen ${pollAgeMs === undefined ? "never" : Math.round(pollAgeMs / 1000) + "s ago"}). ` +
        `Run /librewolf onboard, install the companion extension in your normal ` +
        `LibreWolf profile, and keep that LibreWolf window open.`
      );
    }
    return (
      `Timed out after ${timeoutMs}ms: the LibreWolf extension is polling ` +
      `(last seen ${Math.round((pollAgeMs ?? 0) / 1000)}s ago) but did not pick ` +
      `up this command in time. Retry; if it persists, reload the extension ` +
      `at about:addons.`
    );
  }

  private async sendViaOwner(
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs + 2_000);
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", forwardAbort, { once: true });
    }
    try {
      const response = await fetch(`${this.url}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, params, timeoutMs }),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        ok: boolean;
        result?: unknown;
        error?: string;
      };
      if (!body.ok) throw new Error(body.error ?? "Bridge owner command failed");
      return body.result;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", forwardAbort);
    }
  }

  private enqueue(command: BridgeCommand): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(command);
    else this.queue.push(command);
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", this.url);
    const cors = corsHeadersFor(request);
    if (request.method === "OPTIONS") {
      if (!isBrowserOriginAllowed(request)) {
        sendJson(response, 403, { ok: false, error: "browser origin not allowed" });
        return;
      }
      sendJson(response, 200, { ok: true }, cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/status") {
      sendJson(response, 200, this.status());
      return;
    }
    if (request.method === "POST" && url.pathname === "/command") {
      if (!isLocalProcessRequest(request)) {
        sendJson(response, 403, {
          ok: false,
          error: "Commands are accepted only from local Pi processes",
        });
        return;
      }
      let body: {
        action?: string;
        params?: Record<string, unknown>;
        timeoutMs?: number;
      };
      try {
        body = JSON.parse(await readRequestBody(request)) as typeof body;
      } catch {
        sendJson(response, 400, { ok: false, error: "Invalid JSON body" });
        return;
      }
      if (!body.action) {
        sendJson(response, 400, { ok: false, error: "Missing command action" });
        return;
      }
      try {
        const result = await this.sendLocal(
          body.action,
          body.params ?? {},
          body.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        sendJson(response, 200, { ok: true, result });
      } catch (error) {
        sendJson(response, 504, { ok: false, error: (error as Error).message });
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/next") {
      if (!isBrowserOriginAllowed(request)) {
        sendJson(response, 403, { ok: false, error: "browser origin not allowed" });
        return;
      }
      this.lastSeenAt = Date.now();
      this.clientName = url.searchParams.get("name") ?? undefined;
      let aborted = false;
      let activeWaiter: ((command: BridgeCommand | undefined) => void) | undefined;
      request.once("close", () => {
        aborted = true;
        if (activeWaiter) {
          this.waiters = this.waiters.filter((entry) => entry !== activeWaiter);
        }
      });
      let command = this.queue.shift();
      if (!command) {
        command = await this.waitForCommand(LONG_POLL_MS, (waiter) => {
          activeWaiter = waiter;
        });
      }
      if (aborted) {
        if (command) this.queue.unshift(command);
        return;
      }
      if (command) {
        const entry = this.pending.get(command.id);
        if (entry) entry.deliveredAt = Date.now();
      }
      sendJson(
        response,
        200,
        command
          ? {
              type: "command",
              command,
              expectedBridgeVersion: readBridgeVersion(),
            }
          : { type: "none", expectedBridgeVersion: readBridgeVersion() },
        cors,
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/result") {
      if (!isBrowserOriginAllowed(request)) {
        sendJson(response, 403, { ok: false, error: "browser origin not allowed" });
        return;
      }
      this.lastSeenAt = Date.now();
      let result: BridgeResult;
      try {
        result = JSON.parse(await readRequestBody(request)) as BridgeResult;
      } catch {
        sendJson(response, 400, { ok: false, error: "Invalid JSON body" }, cors);
        return;
      }
      const pending = this.pending.get(result.id);
      if (!pending) {
        sendJson(response, 404, { ok: false, error: "unknown command id" }, cors);
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(result.id);
      if (result.ok) pending.resolve(result.result);
      else pending.reject(new Error(result.error ?? "Extension command failed"));
      sendJson(response, 200, { ok: true }, cors);
      return;
    }
    sendJson(response, 404, { error: "not found" });
  }

  private waitForCommand(
    timeoutMs: number,
    registerWaiter?: (waiter: (command: BridgeCommand | undefined) => void) => void,
  ): Promise<BridgeCommand | undefined> {
    return new Promise((resolveWait) => {
      let settled = false;
      const waiter = (command: BridgeCommand | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.waiters = this.waiters.filter((entry) => entry !== waiter);
        resolveWait(command);
      };
      const timer = setTimeout(() => waiter(undefined), timeoutMs);
      this.waiters.push(waiter);
      registerWaiter?.(waiter);
    });
  }
}

let sharedBridge: LibreWolfBridge | null = null;

/** Process-wide singleton broker. Started lazily, shared by all tools. */
export function getBridge(): LibreWolfBridge {
  if (!sharedBridge) {
    sharedBridge = new LibreWolfBridge(bridgeHost(), bridgePort());
  }
  return sharedBridge;
}

/** Convenience: run one bridge action and return its result. */
export async function runAction(
  action: string,
  params: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  return getBridge().runAction(action, params, timeoutMs);
}
