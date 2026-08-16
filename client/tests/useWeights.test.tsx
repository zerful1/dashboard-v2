import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWeights, weightKey } from "../src/hooks/useWeights";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const entry = (date: string, kg: number) => ({
  id: `id-${date}`,
  user_id: "u1",
  date,
  weight_kg: kg,
  notes: null,
  created_at: "",
});

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const fresh = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

afterEach(() => vi.restoreAllMocks());

describe("useWeights", () => {
  it("scopes the cache key by user so one account cannot read another's rows", () => {
    expect(weightKey("u1")).not.toEqual(weightKey("u2"));
    expect(weightKey("u1")).toContain("u1");
  });

  it("loads entries", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue([entry("2026-08-15", 82.1)]);

    const { result } = renderHook(() => useWeights(), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.entries[0]!.date).toBe("2026-08-15");
  });

  it("replaces rather than duplicates when saving an existing day", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockResolvedValueOnce([entry("2026-08-15", 82.1)]); // list
    spy.mockImplementationOnce(() => new Promise(() => {})); // save, stays pending

    const { result } = renderHook(() => useWeights(), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => {
      result.current.saveWeight.mutate({ date: "2026-08-15", weight_kg: 81.4 });
    });

    // POST upserts on (user_id, date) — one row, the new value. Appending
    // instead would show two rows for one day until the refetch settled.
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]!.weight_kg).toBe(81.4);
    });
  });

  it("rolls back the optimistic write when the save fails", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockResolvedValueOnce([entry("2026-08-15", 82.1)]);
    spy.mockRejectedValueOnce(new ApiError(500, "boom"));
    spy.mockResolvedValue([entry("2026-08-15", 82.1)]); // refetch on settle

    const { result } = renderHook(() => useWeights(), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => {
      result.current.saveWeight.mutate({ date: "2026-08-15", weight_kg: 99 });
    });

    await waitFor(() => expect(result.current.entries[0]!.weight_kg).toBe(82.1));
  });

  it("removes optimistically and restores on failure", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockResolvedValueOnce([entry("2026-08-15", 82.1), entry("2026-08-14", 82.4)]);
    spy.mockRejectedValueOnce(new ApiError(500, "boom"));
    spy.mockResolvedValue([entry("2026-08-15", 82.1), entry("2026-08-14", 82.4)]);

    const { result } = renderHook(() => useWeights(), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));

    act(() => {
      result.current.deleteWeight.mutate("id-2026-08-15");
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
  });

  it("keeps dates as strings, never Date objects", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue([entry("2025-09-26", 84)]);

    const { result } = renderHook(() => useWeights(), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // 26 September is in BST, and is the earliest migrated session date. A Date
    // round trip anywhere in this path would render it as the 25th.
    expect(result.current.entries[0]!.date).toBe("2025-09-26");
    expect(typeof result.current.entries[0]!.date).toBe("string");
  });
});
