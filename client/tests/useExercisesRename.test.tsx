import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useExercises } from "../src/hooks/useExercises";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe("useExercises rename", () => {
  // Lift goals move with a rename on the server, so the
  // Goals section must refetch, or it keeps showing the old name.
  it("refreshes goals after a rename", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/exercises/rename") && init?.method === "POST") {
        return { exercisesUpdated: 1, setsUpdated: 1, finalName: "Lat Pull Down" } as never;
      }
      if (path.startsWith("/api/exercises")) return [] as never;
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useExercises(1), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.renameExercise.mutate({ oldName: "Lat Pulldown", newName: "Lat Pull Down" });
    });
    await waitFor(() => expect(result.current.renameExercise.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["goals"] });
  });
});
