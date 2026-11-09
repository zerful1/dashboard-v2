/**
 * The service worker's cache, by its name in public/sw.js (`CACHE`). The two
 * must match, or this fills a store the worker never reads:
 * tests/warmCache.test.ts holds them together.
 */
export const OFFLINE_CACHE = "dashboard-v2";

/** The build's scripts and styles: what a page needs to open. */
const CODE = /^\/static\/(js|css)\/.+\.(js|css)$/;

interface Deps {
  fetch: typeof fetch;
  caches: CacheStorage;
}

/**
 * Saves every page's code, so a page not opened since the last deploy still
 * opens with no signal.
 *
 * The service worker saves a chunk only when something asks for it, and every
 * page is its own chunk (routes.tsx). After a deploy that left Gym unsaved
 * until it was next opened online: in a gym with no signal it read "This
 * screen failed to load". This asks for the rest once the app is up, reading
 * the list the build wrote (rsbuild.config.ts, `output.manifest`).
 *
 * From the page, not from the worker's install step: a worker installs again
 * only when sw.js itself changes, and sw.js is the same file in every deploy.
 *
 * Code the list no longer names is dropped, so the store holds one deploy's
 * worth rather than every deploy's. Fonts and the barcode decoder are left to
 * the worker: a browser asks for the one font file it needs, and the decoder
 * is a megabyte only a scan uses.
 *
 * Best effort throughout. Any failure leaves what was saved before, and the
 * next start tries again.
 */
export async function warmOfflineCache({ fetch: fetchFn, caches: store }: Deps = { fetch, caches }): Promise<void> {
  try {
    const res = await fetchFn("/asset-manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    const { allFiles } = (await res.json()) as { allFiles?: unknown };
    if (!Array.isArray(allFiles)) return;
    const wanted = new Set(allFiles.filter((f): f is string => typeof f === "string" && CODE.test(f)));
    // An empty list is a manifest that can't be trusted, not a build with no code.
    if (wanted.size === 0) return;

    const cache = await store.open(OFFLINE_CACHE);
    for (const url of wanted) {
      if (await cache.match(url)) continue;
      const asset = await fetchFn(url);
      // A real script or stylesheet only: a missing file answered with the
      // app's HTML would be saved under the chunk's name and served as it.
      const type = asset.headers.get("content-type") ?? "";
      if (asset.ok && !type.includes("text/html")) await cache.put(url, asset);
    }
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url);
      if (CODE.test(pathname) && !wanted.has(pathname)) await cache.delete(request);
    }
  } catch {
    // Offline, a full disk, a blocked store: the app works without it.
  }
}

/** Starts the warm-up once the app has loaded and the browser is idle. */
export function scheduleWarmOfflineCache(): void {
  if (typeof caches === "undefined") return;
  // Someone on a metered connection asked the browser to spend less.
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 3000));
  idle(() => void warmOfflineCache());
}
