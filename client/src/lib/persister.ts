import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/** The persisted query cache, in its own module so AuthProvider can purge it without an import cycle via App. */
export const MAX_AGE = 1000 * 60 * 60 * 24; // 24h

export const persister = createSyncStoragePersister({
  // Guarded so importing cannot throw without a DOM; with no storage the persister is an inert no-op.
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "dashboard-query-cache",
});
