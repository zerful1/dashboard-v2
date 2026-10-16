import type { QueryClient } from "@tanstack/react-query";
import { persister } from "@/lib/persister";

/** Swallows a step's failure: a recovery button must reach its reload. */
const tryTo = async (step: () => unknown) => {
  try {
    await step();
  } catch {
    // Best effort; the reload below is what matters.
  }
};

/**
 * True only when the API answers as itself. `navigator.onLine` is true on dead
 * wifi, and a captive portal answers 200 with its own page, so the guard is
 * the health check's JSON. /api is never cached by the service worker.
 */
async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok && (await res.json())?.ok === true;
  } catch {
    return false;
  }
}

/**
 * "Refresh the app" (Settings): for a phone stuck on an old deploy. Empties
 * this device's copy of everything - the query cache and its persisted copy
 * (CLAUDE.md: qc.clear() alone leaves the persisted one), every Cache Storage
 * entry, the service worker - then reloads. The session cookie is untouched,
 * so the person stays signed in; the server's data is never involved.
 *
 * Returns false, having cleared nothing, when the server can't be reached:
 * with the caches emptied and no signal, the app couldn't open again.
 */
export async function refreshApp(qc: QueryClient, reload: () => void = () => window.location.reload()): Promise<boolean> {
  if (!(await serverReachable())) return false;
  try {
    qc.clear();
    await tryTo(() => persister.removeClient());
    if (typeof caches !== "undefined") {
      await tryTo(async () => Promise.all((await caches.keys()).map((k) => caches.delete(k))));
    }
    if ("serviceWorker" in navigator) {
      await tryTo(async () => Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister())));
    }
  } finally {
    reload();
  }
  return true;
}
