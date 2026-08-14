import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { router } from "@/router";

const queryClient = new QueryClient({
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
