import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { router } from "@/router";

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
 */
const queryClient = new QueryClient({
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
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: {
      // One global failure toast, as in v1 — per-hook handlers roll back cache
      // and never show UI, so error presentation stays in one place.
      onError: (err) => {
        const message = err instanceof ApiError ? err.message : "Something went wrong";
        toast.error(message);
      },
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster theme="dark" position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
