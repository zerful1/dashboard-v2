import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OFFLINE_CACHE, warmOfflineCache } from "../src/lib/warmCache";
import { clientPath } from "./clientRoot";

/**
 * Every page is its own chunk, and the service worker saves a chunk only when
 * something asks for it. So after a deploy, a page not opened since had no
 * code saved, and with no signal read "This screen failed to load". The
 * warm-up asks for the rest.
 */

const ORIGIN = "https://app.test";
const js = (body = "export{}") => new Response(body, { headers: { "content-type": "text/javascript" } });

/** A Cache Storage holding `saved`, and a network answering by path. */
function world(saved: string[], network: Record<string, () => Response>) {
  const store = new Map<string, Response>(saved.map((path) => [path, js()]));
  const cache = {
    match: vi.fn(async (url: string) => store.get(url)),
    put: vi.fn(async (url: string, res: Response) => void store.set(url, res)),
    keys: vi.fn(async () => [...store.keys()].map((path) => ({ url: ORIGIN + path }))),
    delete: vi.fn(async (req: { url: string }) => store.delete(new URL(req.url).pathname)),
  };
  const caches = { open: vi.fn(async () => cache) } as unknown as CacheStorage;
  const fetchFn = vi.fn(async (url: string) => {
    const answer = network[url];
    if (!answer) throw new TypeError("Failed to fetch");
    return answer();
  }) as unknown as typeof fetch;
  return { store, caches, fetch: fetchFn, opened: caches.open as unknown as ReturnType<typeof vi.fn> };
}

const manifest = (allFiles: unknown) => () => new Response(JSON.stringify({ allFiles }));

const HOME = "/static/js/async/1.home.js";
const GYM = "/static/js/async/2.gym.js";
const CSS = "/static/css/index.aaa.css";

describe("warmOfflineCache", () => {
  it("saves the pages not opened yet, and leaves alone what is already saved", async () => {
    const w = world([HOME], {
      "/asset-manifest.json": manifest([HOME, GYM, CSS, "/index.html", "/favicon.svg"]),
      [GYM]: () => js("gym"),
      [CSS]: () => new Response("body{}", { headers: { "content-type": "text/css" } }),
    });

    await warmOfflineCache(w);

    expect([...w.store.keys()].sort()).toEqual([CSS, HOME, GYM].sort());
    // Home was saved already: not fetched again.
    expect(w.fetch).not.toHaveBeenCalledWith(HOME);
    expect(w.opened).toHaveBeenCalledWith(OFFLINE_CACHE);
  });

  it("drops the previous deploy's code, and nothing else", async () => {
    const font = "/static/font/inter.abc.woff2";
    const wasm = "/static/wasm/zxing_reader-3.1.3.wasm";
    const w = world(["/static/js/async/1.old.js", "/static/css/index.old.css", font, wasm, "/index.html", HOME], {
      "/asset-manifest.json": manifest([HOME]),
    });

    await warmOfflineCache(w);

    // The shell, the fonts and the decoder are the worker's to keep.
    expect([...w.store.keys()].sort()).toEqual([font, wasm, "/index.html", HOME].sort());
  });

  it("skips fonts and the barcode decoder", async () => {
    const w = world([], {
      "/asset-manifest.json": manifest(["/static/font/inter.abc.woff2", "/static/wasm/zxing_reader-3.1.3.wasm", HOME]),
      [HOME]: () => js(),
    });

    await warmOfflineCache(w);

    expect([...w.store.keys()]).toEqual([HOME]);
  });

  it("never saves the app's HTML, or an error, under a chunk's name", async () => {
    const w = world([], {
      "/asset-manifest.json": manifest([HOME, GYM]),
      [HOME]: () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
      [GYM]: () => new Response("gone", { status: 404 }),
    });

    await warmOfflineCache(w);

    expect(w.store.size).toBe(0);
  });

  it("changes nothing when the list can't be read or names no code", async () => {
    const old = "/static/js/async/1.old.js";
    for (const answer of [
      () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }), // not JSON
      () => new Response("nope", { status: 500 }),
      manifest([]),
      manifest("not a list"),
      manifest(["/index.html"]),
    ]) {
      const w = world([old], { "/asset-manifest.json": answer });
      await warmOfflineCache(w);
      expect([...w.store.keys()]).toEqual([old]);
    }
  });

  it("keeps what it saved when the signal drops halfway, and never throws", async () => {
    const w = world([], {
      "/asset-manifest.json": manifest([HOME, GYM]),
      [HOME]: () => js(),
      // GYM is unanswered: the fetch rejects, as offline does.
    });

    await expect(warmOfflineCache(w)).resolves.toBeUndefined();

    expect([...w.store.keys()]).toEqual([HOME]);
  });
});

describe("the offline store's wiring", () => {
  it("fills the cache the service worker reads", () => {
    const sw = readFileSync(clientPath("public/sw.js"), "utf8");
    expect(sw).toContain(`const CACHE = '${OFFLINE_CACHE}'`);
  });

  it("the build writes the list the warm-up reads", () => {
    expect(readFileSync(clientPath("rsbuild.config.ts"), "utf8")).toContain("manifest: 'asset-manifest.json'");
  });

  it("a missing /static/ file is a 404, never the app's HTML", () => {
    // The catch-all that serves the app for any path must not answer for
    // /static/ (or /api): a chunk from a previous deploy, or the barcode
    // decoder with its copy step removed, would come back as index.html with
    // a 200 and be cached as the asset.
    const vercel = JSON.parse(readFileSync(resolve(clientPath(".."), "vercel.json"), "utf8")) as {
      rewrites: { source: string; destination: string }[];
    };
    const spa = vercel.rewrites.find((r) => r.destination === "/index.html")!;
    // Vercel's source is a path-to-regexp pattern; this one is a plain regex group.
    const matches = (path: string) => new RegExp(`^${spa.source}$`).test(path);
    expect(matches("/gym")).toBe(true);
    expect(matches("/")).toBe(true);
    expect(matches("/static/js/async/1.gone.js")).toBe(false);
    expect(matches("/static/wasm/zxing_reader-3.1.3.wasm")).toBe(false);
    expect(matches("/api/weight")).toBe(false);
  });
});
