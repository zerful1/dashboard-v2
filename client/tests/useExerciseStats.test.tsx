import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useExerciseStats } from "../src/hooks/useExerciseStats";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

// Mocked BY PATH, not call order — these hooks compose more than one fetch and
// an order-based mock becomes a race that fails plausibly.
function mockByPath(routes: Record<string, unknown>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return hit[1] as never;
  });
}

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
const fresh = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

afterEach(() => vi.restoreAllMocks());

describe("useExerciseStats", () => {
  it("does not fetch without an exercise name", async () => {
    const spy = vi.spyOn(apiModule, "api");
    const { result } = renderHook(() => useExerciseStats(null), { wrapper: wrapper(fresh()) });
    expect(result.current.stats).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("computes stats from the payload", async () => {
    mockByPath({
      "/api/workouts/stats": {
        sets: [
          { session_id: "s1", weight_kg: 80, reps: 8, is_bodyweight: false },
          { session_id: "s2", weight_kg: 85, reps: 5, is_bodyweight: false },
        ],
        sessionDates: { s1: "2026-08-09", s2: "2026-08-16" },
      },
    });

    const { result } = renderHook(() => useExerciseStats("Bench Press"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.stats).not.toBeNull());

    expect(result.current.stats!.heaviestSet!.weight_kg).toBe(85);
    expect(result.current.stats!.sessionCount).toBe(2);
    expect(result.current.stats!.lastTrainedDate).toBe("2026-08-16");
  });

  it("keeps chart dates as unshifted strings", async () => {
    mockByPath({
      "/api/workouts/stats": {
        sets: [{ session_id: "s1", weight_kg: 80, reps: 8, is_bodyweight: false }],
        sessionDates: { s1: "2025-09-26" },
      },
    });

    const { result } = renderHook(() => useExerciseStats("Bench Press"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.stats).not.toBeNull());
    expect(result.current.stats!.chartData[0]!.date).toBe("2025-09-26");
  });

  it("returns empty stats rather than null for an exercise with no sets", async () => {
    mockByPath({ "/api/workouts/stats": { sets: [], sessionDates: {} } });
    const { result } = renderHook(() => useExerciseStats("Nothing"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.stats).not.toBeNull());
    expect(result.current.stats!.sessionCount).toBe(0);
    expect(result.current.stats!.heaviestSet).toBeNull();
  });

  it("recomputes when the exercise changes rather than serving the previous one", async () => {
    // The memo keys on query.data. If it keyed on the name instead, switching
    // exercises would render the previous exercise's stats until the refetch
    // landed — plausible-looking and wrong.
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      const name = decodeURIComponent(path.split("exercise_name=")[1] ?? "");
      return {
        sets: [
          {
            session_id: "s1",
            weight_kg: name === "Squat" ? 140 : 85,
            reps: 5,
            is_bodyweight: false,
          },
        ],
        sessionDates: { s1: "2026-08-16" },
      } as never;
    });

    const qc = fresh();
    const { result, rerender } = renderHook(({ n }) => useExerciseStats(n), {
      wrapper: wrapper(qc),
      initialProps: { n: "Bench Press" as string },
    });
    await waitFor(() => expect(result.current.stats?.heaviestSet?.weight_kg).toBe(85));

    rerender({ n: "Squat" });
    await waitFor(() => expect(result.current.stats?.heaviestSet?.weight_kg).toBe(140));
  });
});
