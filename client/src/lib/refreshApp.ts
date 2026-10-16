import type { QueryClient } from "@tanstack/react-query";
import { persister } from "@/lib/persister";

/**
 * "Refresh the app" (Settings): for a phone stuck on an old deploy. Empties
 * this device's copy of everything - the query cache and its persisted copy
 * (CLAUDE.md: qc.clear() alone leaves the persisted one), every Cache Storage
 * entry, the service worker - then reloads. The session cookie is untouched,
 * so the person stays signed in; the server's data is never involved.
 */
export async function refreshApp(qc: QueryClient, reload: () => void = () => window.location.reload()): Promise<void> {
  qc.clear();
  await persister.removeClient();
  if (typeof caches !== "undefined") {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  }
  if ("serviceWorker" in navigator) {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  }
  reload();
}
