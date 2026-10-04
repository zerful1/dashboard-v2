import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDiary, diaryKey } from "../src/hooks/useDiary";
import { NUTRITION_READERS } from "../src/hooks/invalidate";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { createQueryClient } from "../src/lib/queryClient";
import type { DiaryEntryInput, FoodLogEntry } from "@dashboard/shared";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const saved: FoodLogEntry = {
  id: "e1", user_id: "u1", date: "2026-09-21", logged_at: "2026-09-21T08:00:00.000Z", food_item_id: null,
  name: "Oats", quantity: 80, unit: "g", calories: 304, protein_g: 10.4, fat_g: 5.6, carbs_g: 52,
  fibre_g: 7.2, sugar_g: null, sat_fat_g: null, salt_g: null,
};
const input: DiaryEntryInput = {
  date: "2026-09-21", name: "Banana", quantity: 1, unit: "serving", calories: 105, protein_g: 1.3, fat_g: 0.4, carbs_g: 27,
  fibre_g: 3.1, sugar_g: 14, sat_fat_g: null, salt_g: null,
};

/** By path and method, longest prefix first - never by call order. */
function mockApi(routes: [string, (init?: RequestInit) => unknown][]) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const hit = routes.find(([p]) => key.startsWith(p));
    if (!hit) throw new Error(`unexpected ${key}`);
    return hit[1](init) as never;
  });
}

const fresh = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
/** The app's own client, for rules that live in its defaults, without retry delays. */
const real = () => {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { ...client.getDefaultOptions().mutations, retry: false } });
  return client;
};
const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("useDiary", () => {
  it("scopes the cache key by user and date", () => {
    expect(diaryKey("u1", "2026-09-21")).not.toEqual(diaryKey("u2", "2026-09-21"));
    expect(diaryKey("u1", "2026-09-21")).not.toEqual(diaryKey("u1", "2026-09-22"));
  });

  it("shows an added entry at once, before the server answers", async () => {
    mockApi([
      ["POST /api/nutrition/diary", () => new Promise(() => {})],
      ["GET /api/nutrition/diary", () => [saved]],
    ]);
    const { result } = renderHook(() => useDiary("2026-09-21"), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.addEntry.mutate(input));
    await waitFor(() => expect(result.current.entries.map((e) => e.name)).toEqual(["Oats", "Banana"]));
  });

  it("rolls the optimistic entry back when the save fails", async () => {
    mockApi([
      ["POST /api/nutrition/diary", () => Promise.reject(new ApiError(500, "boom"))],
      ["GET /api/nutrition/diary", () => [saved]],
    ]);
    const { result } = renderHook(() => useDiary("2026-09-21"), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => result.current.addEntry.mutate(input));
    await waitFor(() => expect(result.current.addEntry.isError).toBe(true));
    expect(result.current.entries.map((e) => e.name)).toEqual(["Oats"]);
  });

  // CLAUDE.md: writes are not queued offline. TanStack's default PAUSES a
  // mutation while offline and replays it on reconnect - the optimistic row
  // looks saved, and closing the app loses it. Found in the browser.
  it("fails an add made offline instead of queueing it", async () => {
    mockApi([
      ["POST /api/nutrition/diary", () => Promise.reject(new TypeError("Failed to fetch"))],
      ["GET /api/nutrition/diary", () => [saved]],
    ]);
    const { result } = renderHook(() => useDiary("2026-09-21"), { wrapper: wrapper(real()) });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    onlineManager.setOnline(false);
    act(() => result.current.addEntry.mutate(input));
    await waitFor(() => expect(result.current.addEntry.isError).toBe(true));
    expect(result.current.addEntry.isPaused).toBe(false);
    expect(result.current.entries.map((e) => e.name)).toEqual(["Oats"]);
  });

  it("refreshes every nutrition reader after a write", async () => {
    mockApi([
      ["POST /api/nutrition/diary/copy", () => []],
      ["GET /api/nutrition/diary", () => []],
    ]);
    const client = fresh();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDiary("2026-09-22"), { wrapper: wrapper(client) });

    act(() => result.current.copyDay.mutate({ from: "2026-09-21", to: "2026-09-22" }));
    await waitFor(() => expect(result.current.copyDay.isSuccess).toBe(true));
    for (const prefix of NUTRITION_READERS) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [prefix] });
    }
  });

  // #17 review (3): rescale and remove rolled back into whichever day was showing.
  for (const op of ["rescale", "remove"] as const) {
    it(`rolls a failed ${op} back into the day it came from, after the day changes`, async () => {
      let fail!: () => void;
      mockApi([
        ["GET /api/nutrition/diary?date=2026-09-21", () => [saved]],
        ["GET /api/nutrition/diary?date=2026-09-22", () => []],
        [op === "rescale" ? "PATCH /api/nutrition/diary/" : "DELETE /api/nutrition/diary/",
          () => new Promise((_, reject) => (fail = () => reject(new ApiError(500, "boom"))))],
      ]);
      const client = fresh();
      const { result, rerender } = renderHook(({ date }) => useDiary(date), {
        wrapper: wrapper(client), initialProps: { date: "2026-09-21" },
      });
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      act(() => {
        if (op === "rescale") result.current.rescaleEntry.mutate({ id: "e1", quantity: 160 });
        else result.current.removeEntry.mutate("e1");
      });
      rerender({ date: "2026-09-22" });
      await waitFor(() => expect(result.current.entries).toEqual([]));
      await act(async () => fail());
      await waitFor(() => expect(client.getQueryData(diaryKey("u1", "2026-09-21"))).toEqual([saved]));
      expect(client.getQueryData(diaryKey("u1", "2026-09-22"))).toEqual([]);
    });
  }
});
