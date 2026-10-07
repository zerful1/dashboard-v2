import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { foodDaysKey, useFoodDays } from "../src/hooks/useFoodDays";
import { NUTRITION_READERS } from "../src/hooks/invalidate";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const WED = "2026-10-07";
const TUE = "2026-10-06";
const TUESDAY = { date: TUE, calories: 2979, protein_g: 131 };

function client(): QueryClient {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  return qc;
}
const wrapper = (qc: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

/** By path. */
function mockDays(answer: (from: string, to: string) => unknown) {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith("/api/nutrition/days")) {
      const q = new URL(path, "http://x").searchParams;
      return (await answer(q.get("from")!, q.get("to")!)) as never;
    }
    throw new Error(`unexpected ${path}`);
  });
  return calls;
}

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useFoodDays", () => {
  it("asks for the seven days by range", async () => {
    const calls = mockDays(() => [TUESDAY]);
    const { result } = renderHook(() => useFoodDays("2026-10-01", WED, WED), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.days).toEqual([TUESDAY]));
    expect(calls).toEqual(["/api/nutrition/days?from=2026-10-01&to=2026-10-07"]);
  });

  it("is redrawn by every diary write", () => {
    expect(NUTRITION_READERS).toContain("foodDays");
  });

  it("shows yesterday's seven days offline on a new day, with today flagged", () => {
    mockDays(() => []);
    onlineManager.setOnline(false);
    const qc = client();
    qc.setQueryData(foodDaysKey("u1", "2026-09-30", TUE), [TUESDAY]);
    const { result } = renderHook(() => useFoodDays("2026-10-01", WED, WED), { wrapper: wrapper(qc) });
    expect(result.current.days).toEqual([TUESDAY]);
    expect(result.current.isPlaceholder).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  // Review focus 1: any other window would read its missing days as "nothing logged".
  it("never borrows another window for a past week", () => {
    mockDays(() => new Promise(() => {}));
    const qc = client();
    qc.setQueryData(foodDaysKey("u1", "2026-10-01", WED), [TUESDAY]);
    const { result } = renderHook(() => useFoodDays("2026-09-24", "2026-09-30", WED), { wrapper: wrapper(qc) });
    expect(result.current.days).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });

  // A past week's own "day before" is just as wrong: the strip would show it a day out.
  it("borrows only for the week ending today", () => {
    mockDays(() => new Promise(() => {}));
    const qc = client();
    qc.setQueryData(foodDaysKey("u1", "2026-09-23", "2026-09-29"), [{ date: "2026-09-29", calories: 2000, protein_g: 150 }]);
    const { result } = renderHook(() => useFoodDays("2026-09-24", "2026-09-30", WED), { wrapper: wrapper(qc) });
    expect(result.current.days).toBeUndefined();
  });

  it("never borrows an older window than yesterday's, or another account's", () => {
    mockDays(() => new Promise(() => {}));
    const qc = client();
    qc.setQueryData(foodDaysKey("u1", "2026-09-29", "2026-10-05"), [{ date: "2026-10-05", calories: 2000, protein_g: 150 }]);
    qc.setQueryData(foodDaysKey("u2", "2026-09-30", TUE), [TUESDAY]);
    const { result } = renderHook(() => useFoodDays("2026-10-01", WED, WED), { wrapper: wrapper(qc) });
    expect(result.current.days).toBeUndefined();
  });

  it("reports a failure with nothing to show, without a toast", async () => {
    mockDays(() => {
      throw new ApiError(500, "boom");
    });
    const { result } = renderHook(() => useFoodDays("2026-10-01", WED, WED), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Review focus 4.
  it("keeps the last good days when a refresh fails", async () => {
    let down = false;
    mockDays(() => {
      if (down) throw new ApiError(500, "boom");
      return [TUESDAY];
    });
    const qc = client();
    const { result } = renderHook(() => useFoodDays("2026-10-01", WED, WED), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.days).toEqual([TUESDAY]));
    down = true;
    await act(() => qc.refetchQueries({ queryKey: ["foodDays"] }));
    expect(result.current.failed).toBe(false);
    expect(result.current.days).toEqual([TUESDAY]);
  });
});
