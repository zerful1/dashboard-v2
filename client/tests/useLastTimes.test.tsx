import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lastTimesQueryOptions, useLastTimes } from "../src/hooks/useLastTimes";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

function run(names: string[], before: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useLastTimes(names, before), { wrapper });
}

afterEach(() => vi.restoreAllMocks());

describe("useLastTimes (redesign part 3a, §4)", () => {
  // Review focus 4.
  it("asks for every name before the date, each one encoded", async () => {
    const LAST = { "Row & Press": { date: "2026-10-02", sets: [] } };
    const api = vi.spyOn(apiModule, "api").mockResolvedValue(LAST as never);
    const { result } = run(["Squat", "Row & Press"], "2026-10-06");
    await waitFor(() => expect(result.current).toEqual(LAST));
    expect(api).toHaveBeenCalledWith("/api/workouts/last-times?before=2026-10-06&name=Row%20%26%20Press&name=Squat");
  });

  it("asks for nothing with an empty list", async () => {
    const api = vi.spyOn(apiModule, "api").mockResolvedValue({} as never);
    const { result } = run([], "2026-10-06");
    await new Promise((r) => setTimeout(r, 20));
    expect(api).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
  });

  it("is one cache entry for the same names in any order", () => {
    expect(lastTimesQueryOptions("u1", ["B", "A"], "2026-10-06").queryKey).toEqual(
      lastTimesQueryOptions("u1", ["A", "B"], "2026-10-06").queryKey,
    );
  });
});
