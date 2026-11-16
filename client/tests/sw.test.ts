import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The worker is plain JS in public/, so it is loaded into a stub ServiceWorkerGlobalScope. */
type Listener = (e: unknown) => void;

function workerSource(): string {
  // Resolved from cwd rather than import.meta.url (not file:// under Vite).
  const src = ["client/public/sw.js", "public/sw.js"].reduce<string | null>((found, rel) => {
    if (found !== null) return found;
    try {
      return readFileSync(resolve(process.cwd(), rel), "utf8");
    } catch {
      return null;
    }
  }, null);
  if (src === null) throw new Error("could not locate public/sw.js");
  return src;
}

function loadWorker(opts: { response?: () => Response } = {}) {
  const src = workerSource();
  const listeners: Record<string, Listener> = {};

  const scope = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    location: { origin: "https://app.test" },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const cache = { addAll: vi.fn(), put: vi.fn() };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    match: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
  };
  const fetchStub = vi.fn(async () => (opts.response ? opts.response() : new Response("ok")));

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "caches", "fetch", src)(scope, caches, fetchStub);

  return { listeners, caches, cache, fetchStub };
}

function fire(
  listeners: Record<string, Listener>,
  url: string,
  init: { method?: string; mode?: string } = {},
) {
  const respondWith = vi.fn();
  listeners.fetch!({
    request: { url, method: init.method ?? "GET", mode: init.mode ?? "no-cors" },
    respondWith,
  });
  return respondWith;
}

/** Wait for the promise handed to respondWith, then for the detached `caches.open(...).then(put)` chain. */
async function settle(respondWith: ReturnType<typeof vi.fn>) {
  await respondWith.mock.calls[0]?.[0];
  await new Promise((r) => setTimeout(r, 0));
}

describe("service worker", () => {
  /** The rule that matters most, asserted structurally. */
  it("returns on /api before the handler responds to anything", () => {
    const handler = workerSource().slice(workerSource().indexOf("addEventListener('fetch'"));
    const guard = handler.indexOf("startsWith('/api')");
    const firstRespond = handler.indexOf("respondWith");

    expect(guard, "the /api guard is missing").toBeGreaterThan(-1);
    expect(firstRespond, "the fetch handler responds to nothing").toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstRespond);
  });

  it("never handles /api, so authenticated JSON is never cached", () => {
    const { listeners } = loadWorker();

    for (const path of [
      "/api/weight",
      "/api/workouts/sessions?limit=20",
      "/api/auth/me",
      "/api/profile",
    ]) {
      const respondWith = fire(listeners, `https://app.test${path}`);
      // Not "responds from the network" but not handled AT ALL.
      expect(respondWith, path).not.toHaveBeenCalled();
    }
  });

  it("leaves /api alone even for a navigation-mode GET", () => {
    // The navigation branch has no path guard of its own, so /api has to have returned before reaching it.
    const { listeners } = loadWorker();
    const respondWith = fire(listeners, "https://app.test/api/weight", { mode: "navigate" });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("ignores writes", () => {
    const { listeners } = loadWorker();
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      const respondWith = fire(listeners, "https://app.test/static/js/main.js", { method });
      expect(respondWith, method).not.toHaveBeenCalled();
    }
  });

  it("ignores other origins", () => {
    const { listeners } = loadWorker();
    const respondWith = fire(listeners, "https://fonts.example.com/x.woff2");
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("does serve hashed build output", () => {
    // The complement: proves the /api assertions mean something rather than the handler never responding to anything.
    const { listeners } = loadWorker();
    const respondWith = fire(listeners, "https://app.test/static/js/main.abc123.js");
    expect(respondWith).toHaveBeenCalled();
  });

  it("does serve navigations", () => {
    const { listeners } = loadWorker();
    const respondWith = fire(listeners, "https://app.test/gym", { mode: "navigate" });
    expect(respondWith).toHaveBeenCalled();
  });

  it("caches a successful navigation as the offline shell", async () => {
    const { listeners, cache } = loadWorker();
    const respondWith = fire(listeners, "https://app.test/gym", { mode: "navigate" });
    await settle(respondWith);
    expect(cache.put).toHaveBeenCalledWith("/index.html", expect.anything());
  });

  it("does NOT cache an error page as the offline shell", async () => {
    // fetch() resolves on a 500, so without the res.ok guard a mid-deploy error page becomes the shell every offline load is served.
    const { listeners, cache } = loadWorker({
      response: () => new Response("gateway error", { status: 502 }),
    });
    const respondWith = fire(listeners, "https://app.test/gym", { mode: "navigate" });
    await settle(respondWith);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("caches hashed build output it fetched", async () => {
    // The complement of the next test: an asset that IS one gets saved.
    const { listeners, cache } = loadWorker({
      response: () => new Response("export{}", { headers: { "content-type": "text/javascript" } }),
    });
    const respondWith = fire(listeners, "https://app.test/static/js/async/1.abc.js");
    await settle(respondWith);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache the app's HTML under an asset's name", async () => {
    // A host answering a missing /static/ file with the shell and a 200 would have it saved for good as that chunk, until CACHE is bumped.
    const { listeners, cache } = loadWorker({
      response: () => new Response("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    const respondWith = fire(listeners, "https://app.test/static/js/async/1.gone.js");
    await settle(respondWith);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
