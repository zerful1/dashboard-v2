import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { MAX_AGE } from "@/lib/persister";

/**
 * ERROR PRESENTATION — the whole rule, in one sentence:
 * a form submission renders its own inline error next to its controls;
 * everything else toasts.
 *
 * Submitting is a moment the user is waiting on a specific set of fields, so
 * the message belongs beside them (see components/ui/FormError). Anything else
 * — an autosave on blur, a background refetch — fails after the user has moved
 * on, with no submit button to anchor a message to, so it toasts. The one
 * exception is a query whose page cannot render at all without it: that page
 * shows its own error state and opts out of the toast below, so a single
 * failure never reports itself twice.
 *
 * A factory, in its own module, so the rule can be tested against the real
 * configuration rather than a copy of it.
 */
/**
 * A failed write's message. Offline, it says so: the banner beside it already
 * says changes won't save, and "Something went wrong" read as a different,
 * unexplained fault.
 */
export function writeFailureMessage(err: unknown): string {
  // api() gave up waiting (dead wifi, a captive portal). Not "not saved", as
  // offline: a slow write can still land after the app gave up, and the
  // refetch on settle shows whether it did.
  if (err instanceof ApiError && err.code === "timeout") return "Timed out — may not have saved";
  if (err instanceof ApiError) return err.message;
  // onlineManager changes only on an online/offline event, and createQueryClient
  // syncs it only at startup, so navigator.onLine false is checked here too: it
  // is trustworthy, as useOnline treats it.
  if (!onlineManager.isOnline() || navigator.onLine === false) return "You're offline — not saved";
  return "Something went wrong";
}

export function createQueryClient(): QueryClient {
  // TanStack's onlineManager starts online and changes only on an online/offline
  // event, so an app opened with no signal fetched anyway: every query failed,
  // and toasted over the data it had saved. navigator.onLine is trustworthy when
  // false (useOnline), so start offline then: queries pause on their saved data,
  // and the "online" event resumes them. In the factory, so the app's one client
  // and the tests take the same path.
  if (navigator.onLine === false) onlineManager.setOnline(false);
  return new QueryClient({
    queryCache: new QueryCache({
      // Query rejections have no other outlet. v5 removed per-query `onError`
      // entirely and there is no `defaultOptions.queries.onError`, so without
      // this handler a failed fetch is completely silent — no toast, no console,
      // nothing — and each caller is left to notice on its own.
      onError: (err, query) => {
        // A 401 means the session ended, not that this query is broken. Auth
        // owns that story (ProtectedRoute redirects, sign-out clears the cache
        // and the emptied queries refetch on their way out); a toast reading
        // "Not authenticated" as the user signs out is noise, not news.
        if (err instanceof ApiError && err.status === 401) return;
        // Opt-out for a query whose own page renders the failure — one failure,
        // one message. Set `meta: { errorToast: false }` on the query, and only
        // when there is real error UI to replace this.
        if (query.meta?.errorToast === false) return;
        toast.error(err instanceof ApiError ? err.message : "Something went wrong");
      },
    }),
    mutationCache: new MutationCache({
      // One global failure toast, as in v1: per-hook handlers roll back cache
      // and never show UI, so error presentation stays in one place.
      //
      // On the CACHE, not in defaultOptions.mutations. TanStack merges a hook's
      // options over the defaults with a plain spread, so a hook's own onError -
      // and every rollback hook has one - replaced the default, and its failures
      // went unreported. The cache's onError runs as well as the hook's, always.
      onError: (err, _variables, _result, mutation) => {
        // A screen that shows its own failure opts out, as queries do.
        if (mutation.options.meta?.errorToast === false) return;
        toast.error(writeFailureMessage(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Once, but not after a timeout: dead wifi already waited 15 s, and a
        // retry doubled it before saying so.
        retry: (failures, err) => failures < 1 && !(err instanceof ApiError && err.code === "timeout"),
        // Must be >= the persister maxAge. Below it, a query is garbage collected
        // from memory before its persisted copy expires, and the restored cache
        // silently comes back empty.
        gcTime: MAX_AGE,
      },
      mutations: {
        // Writes are not queued offline, in any feature (CLAUDE.md). TanStack's
        // default, "online", pauses a write while offline and replays it on
        // reconnect: the optimistic row looks saved, and closing the app before
        // the signal returns loses it. "always" sends it anyway, the fetch
        // fails, the hook rolls back and the MutationCache above toasts.
        // A plain option, so the shallow merge that sank the old onError is
        // harmless here: a hook inherits it unless it sets its own.
        networkMode: "always",
      },
    },
  });
}
