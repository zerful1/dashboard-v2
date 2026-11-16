import type { CSSProperties } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { router } from "@/router";
import { MAX_AGE, persister } from "@/lib/persister";
import { shouldPersistQuery } from "@/lib/persistFilter";
import { createQueryClient } from "@/lib/queryClient";

// Error presentation and query defaults live in lib/queryClient.ts.
const queryClient = createQueryClient();

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        // Bump on ANY change to a cached query's shape, or the restored cache reaches components expecting the new one.
        buster: "v6",
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster
          theme="dark"
          position="top-center"
          // sonner reads these variables; richColors would flood the whole toast with the signal colour.
          style={
            {
              "--normal-bg": "var(--color-surface)",
              "--normal-border": "var(--color-edge)",
              "--normal-text": "var(--color-text)",
              "--border-radius": "14px",
              fontFamily: "var(--font-sans)",
            } as CSSProperties
          }
          icons={{
            success: <ToastDot className="bg-good">✓</ToastDot>,
            error: <ToastDot className="bg-negative">!</ToastDot>,
          }}
        />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

function ToastDot({ className, children }: { className: string; children: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-bg ${className}`}
    >
      {children}
    </span>
  );
}
