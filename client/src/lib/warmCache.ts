/** The service worker's cache by name; must match `CACHE` in public/sw.js (tests/warmCache.test.ts). */
export const OFFLINE_CACHE = "dashboard-v2";

/** The build's scripts and styles: what a page needs to open. */
const CODE = /^\/static\/(js|css)\/.+\.(js|css)$/;

interface Deps {
  fetch: typeof fetch;
  caches: CacheStorage;
}

/** Saves every page's code from the build manifest so unopened pages open offline; best effort, drops old deploys. */
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
      // A real script or stylesheet only: a missing file answered with the app's HTML would be cached as the chunk.
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
