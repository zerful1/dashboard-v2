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

/** True only when the API answers as itself: onLine is true on dead wifi and a captive portal answers 200. */
async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok && (await res.json())?.ok === true;
  } catch {
    return false;
  }
}

/** "Refresh the app": clears this device's caches and service worker, then reloads; false when offline. */
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
