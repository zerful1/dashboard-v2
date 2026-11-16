import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { MAX_AGE } from "@/lib/persister";

/** A failed write's message; offline it says so, matching the banner. Error rule: forms render inline, all else toasts. */
export function writeFailureMessage(err: unknown): string {
  // api() timed out: a slow write can still land, so not "not saved"; the refetch on settle shows which.
  if (err instanceof ApiError && err.code === "timeout") return "Timed out — may not have saved";
  if (err instanceof ApiError) return err.message;
  // onlineManager only changes on events, so check navigator.onLine (trustworthy when false) here too.
  if (!onlineManager.isOnline() || navigator.onLine === false) return "You're offline — not saved";
  return "Something went wrong";
}

export function createQueryClient(): QueryClient {
  // Start offline when navigator.onLine is false: onlineManager starts online, so queries would fail over saved data.
  if (navigator.onLine === false) onlineManager.setOnline(false);
  return new QueryClient({
    queryCache: new QueryCache({
      // Query rejections have no other outlet: v5 has no query onError, so without this a failed fetch is silent.
      onError: (err, query) => {
        // A 401 means the session ended, which auth handles; a toast would be noise.
        if (err instanceof ApiError && err.status === 401) return;
        // Opt-out via meta: { errorToast: false }, only for a query whose page renders its own failure.
        if (query.meta?.errorToast === false) return;
        toast.error(err instanceof ApiError ? err.message : "Something went wrong");
      },
    }),
    mutationCache: new MutationCache({
      // One global failure toast, on the cache: a hook's own onError would replace one in defaultOptions.mutations.
      onError: (err, _variables, _result, mutation) => {
        // A screen that shows its own failure opts out, as queries do.
        if (mutation.options.meta?.errorToast === false) return;
        toast.error(writeFailureMessage(err));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Once, but not after a timeout: dead wifi already waited 15 s.
        retry: (failures, err) => failures < 1 && !(err instanceof ApiError && err.code === "timeout"),
        // Must be >= the persister maxAge, or queries are collected before their persisted copy expires.
        gcTime: MAX_AGE,
      },
      mutations: {
        // Never queue writes offline (CLAUDE.md): the default "online" mode pauses and replays them, so they look saved.
        networkMode: "always",
      },
    },
  });
}
