import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWorkoutDay } from "../src/hooks/useWorkoutDay";
import { createQueryClient } from "../src/lib/queryClient";
import { SESSION_READERS } from "../src/hooks/invalidate";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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
 * useWorkoutDay's session query makes two sequential api calls (getSession then
 * listSets); a parallel query would intercept a value meant for one of them, so
 * paths, not order, decide.
 */
function mockApi(routes: {
  session?: unknown;
  sets?: unknown;
  logSet?: () => Promise<unknown>;
  deleteSet?: () => Promise<unknown>;
}) {
  return vi
    .spyOn(apiModule, "api")
    .mockImplementation(async (path: string, options?: RequestInit) => {
      const method = options?.method ?? "GET";
      if (path.startsWith("/api/workouts/session?")) return routes.session ?? null;
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

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("useWorkoutDay", () => {
  // The user's call (2026-10-03): a set logged with no signal fails and is
  // logged again once back online, rather than queueing and looking saved.
  // The real client, because the rule is its default, not this hook's option.
  it("fails a set logged offline instead of queueing it", async () => {
    mockApi({ session, sets: [aSet(1, 100)], logSet: () => Promise.reject(new TypeError("Failed to fetch")) });
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false }, mutations: { ...client.getDefaultOptions().mutations, retry: false } });
    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));

    onlineManager.setOnline(false);
    act(() => {
      result.current.logSet.mutate({ exercise_name: "Squat", set_number: 2, weight_kg: 100, reps: 5, is_bodyweight: false });
    });
    await waitFor(() => expect(result.current.logSet.isError).toBe(true));
    expect(result.current.logSet.isPaused).toBe(false);
    // Rolled back: no set that looks saved but is not.
    expect(result.current.sets).toHaveLength(1);
  });

  it("sends both sides of a single-sided set, and counts the weaker one straight away", async () => {
    const spy = mockApi({ session, sets: [], logSet: pending });
    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.logSet.mutate({
        exercise_name: "Unilateral Curl", set_number: 1, weight_kg: 12,
        reps_left: 7, reps_right: 8, is_bodyweight: false,
      });
    });

    await waitFor(() => expect(result.current.sets).toHaveLength(1));
    expect(result.current.sets[0]).toMatchObject({ reps: 7, reps_left: 7, reps_right: 8 });
    const post = spy.mock.calls.find(([p, o]) => p === "/api/workouts/sets" && o?.method === "POST");
    const body = JSON.parse(String(post![1]!.body));
    expect(body).toMatchObject({ reps_left: 7, reps_right: 8 });
    expect(body).not.toHaveProperty("reps");
  });

  it("gives a plain set no sides on the optimistic row", async () => {
    mockApi({ session, sets: [], logSet: pending });
    const { result } = renderHook(() => useWorkoutDay(1, "2026-08-16"), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.logSet.mutate({ exercise_name: "Squat", set_number: 1, weight_kg: 100, reps: 5, is_bodyweight: false });
    });
    await waitFor(() => expect(result.current.sets).toHaveLength(1));
    expect(result.current.sets[0]).toMatchObject({ reps: 5, reps_left: null, reps_right: null });
  });

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
