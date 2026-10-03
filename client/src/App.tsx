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
        // Bump on ANY change to a cached query shape. Without it a restored
        // cache from the previous deploy is handed to components expecting the
        // new shape, which fails far from the cause.
        // v2: Profile gained the body-detail fields (nutrition, phase 1).
        // v3: WorkoutSet gained reps_left / reps_right (single-sided sets).
        buster: "v3",
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster theme="dark" position="top-center" richColors />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
