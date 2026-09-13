import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWorkoutDay } from "../src/hooks/useWorkoutDay";
import { SESSION_READERS } from "../src/hooks/invalidate";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const session = {
  id: "s1",
  user_id: "u1",
  date: "2026-08-16",
  day_type: 1,
  day_name: "Legs",
  notes: null,
  created_at: "",
};
const aSet = (n: number, w: number) => ({
  id: `set-${n}`,
  user_id: "u1",
  session_id: "s1",
  exercise_name: "Squat",
  set_number: n,
  weight_kg: w,
  reps: 5,
  is_bodyweight: false,
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

/**
 * Mocks by PATH, not by call order.
 *
 * useWorkoutDay runs two queries in parallel: `session` makes two sequential
 * api calls (getSession then listSets) while `lastSession` makes one. Chained
 * mockResolvedValueOnce hands values out in call order, so lastSession
 * intercepts the value meant for listSets and the sets array arrives as {}.
 * Parallel queries cannot be described by a sequence.
 */
function mockApi(routes: {
  session?: unknown;
  sets?: unknown;
  lastSession?: unknown;
  logSet?: () => Promise<unknown>;
  deleteSet?: () => Promise<unknown>;
}) {
  return vi
    .spyOn(apiModule, "api")
    .mockImplementation(async (path: string, options?: RequestInit) => {
      const method = options?.method ?? "GET";
      if (path.startsWith("/api/workouts/session?")) return routes.session ?? null;
      if (path.startsWith("/api/workouts/last-session")) return routes.lastSession ?? {};
      if (path.startsWith("/api/workouts/sets?")) return routes.sets ?? [];
      if (path === "/api/workouts/sets" && method === "POST") {
        return routes.logSet ? routes.logSet() : {};
      }
      if (path.startsWith("/api/workouts/sets/") && method === "DELETE") {
        return routes.deleteSet ? routes.deleteSet() : undefined;
      }
      throw new Error(`unexpected ${method} ${path}`);
    });
}

const pending = () => new Promise<never>(() => {});

afterEach(() => vi.restoreAllMocks());

describe("useWorkoutDay", () => {
  it("treats a missing session as empty, not an error", async () => {
    mockApi({ session: null });
    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.sets).toEqual([]);
  });

  it("loads the session and its sets", async () => {
    mockApi({ session, sets: [aSet(1, 100)] });

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));
    expect(result.current.session?.day_name).toBe("Legs");
  });

  it("REPLACES rather than appends when the same set number is logged again", async () => {
    mockApi({ session, sets: [aSet(1, 100)], logSet: pending });

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));

    act(() => {
      result.current.logSet.mutate({
        exercise_name: "Squat",
        set_number: 1,
        weight_kg: 105,
        reps: 5,
        is_bodyweight: false,
      });
    });

    // The server upserts, so the optimistic write must too.
    await waitFor(() => {
      expect(result.current.sets).toHaveLength(1);
      expect(result.current.sets[0]!.weight_kg).toBe(105);
    });
  });

  it("zeroes the weight for a bodyweight set optimistically", async () => {
    mockApi({ session: null, logSet: pending });

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.logSet.mutate({
        exercise_name: "Pull Up",
        set_number: 1,
        weight_kg: 80,
        reps: 8,
        is_bodyweight: true,
      });
    });

    // Matches the server, which forces 0 at write time.
    await waitFor(() => expect(result.current.sets[0]!.weight_kg).toBe(0));
  });

  it("rolls back a failed log", async () => {
    mockApi({
      session,
      sets: [aSet(1, 100)],
      logSet: () => Promise.reject(new ApiError(500, "boom")),
    });

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));

    act(() => {
      result.current.logSet.mutate({
        exercise_name: "Squat",
        set_number: 2,
        weight_kg: 105,
        reps: 5,
        is_bodyweight: false,
      });
    });

    await waitFor(() => expect(result.current.sets).toHaveLength(1));
  });

  it("marks every session reader stale after logging a set", async () => {
    // The defect: logSet invalidated workoutDay and coaching only. Seven other
    // queries read the same rows and were never invalidated by any mutation,
    // so Home said "Not started" after the first set of the day, History was
    // missing the session, and Stats lacked the set — until a hard reload,
    // since the cache is persisted.
    //
    // SESSION_READERS is imported from the module the hook uses, so this
    // cannot drift from what is actually invalidated.
    mockApi({ session, sets: [] });
    const qc = fresh();

    // Seed one entry per reader, under the user id the mock above returns.
    for (const prefix of SESSION_READERS) {
      qc.setQueryData([prefix, "u1", "any"], { seeded: true });
    }

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logSet.mutateAsync({
        exercise_name: "Squat",
        set_number: 1,
        weight_kg: 100,
        reps: 5,
        is_bodyweight: false,
      });
    });

    for (const prefix of SESSION_READERS) {
      const state = qc.getQueryState([prefix, "u1", "any"]);
      expect(state?.isInvalidated, prefix).toBe(true);
    }
  });

  it("keeps sets ordered by exercise then set number", async () => {
    mockApi({ session, sets: [aSet(2, 100)], logSet: pending });

    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), {
      wrapper: wrapper(fresh()),
    });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));

    // Logging set 1 after set 2 exists must not leave it appended at the end.
    act(() => {
      result.current.logSet.mutate({
        exercise_name: "Squat",
        set_number: 1,
        weight_kg: 95,
        reps: 5,
        is_bodyweight: false,
      });
    });

    await waitFor(() => expect(result.current.sets).toHaveLength(2));
    expect(result.current.sets.map((s) => s.set_number)).toEqual([1, 2]);
  });
});
