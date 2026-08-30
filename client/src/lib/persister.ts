import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/**
 * The persisted copy of the query cache, in its own module rather than App.tsx.
 *
 * App imports AuthProvider, and AuthProvider has to purge this on sign-out, so
 * exporting it from App would be an import cycle. A module both can import is
 * the honest shape.
 */
export const MAX_AGE = 1000 * 60 * 60 * 24; // 24h

export const persister = createSyncStoragePersister({
  // Guarded so importing this module cannot throw where there is no DOM. With
  // no storage the persister is an inert no-op, which is the right behaviour
  // for an environment that cannot persist anyway.
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: "dashboard-query-cache",
});
