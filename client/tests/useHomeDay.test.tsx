import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { useHomeDay } from "../src/hooks/useHomeDay";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

// DEFAULT_SPLIT is Monday-first [3,2,1,'rest',5,4,'rest']: Wednesday is Legs (1), Thursday rests.
const WED = "2026-08-26";
const THU = "2026-08-27";
const weighIn = (date: string) => ({ id: `w-${date}`, user_id: "u1", date, weight_kg: 80.6, notes: null, created_at: "" });
const exercise = (name: string) => ({ id: name, user_id: "u1", day_type: 1, exercise_name: name, sort_order: 1 });
const set = (name: string) => ({
  id: `${name}-${Math.random()}`, user_id: "u1", session_id: "s1", exercise_name: name, set_number: 1,
  weight_kg: 100, reps: 5, reps_left: null, reps_right: null, is_bodyweight: false,
});
const NEVER = () => new Promise(() => {});

interface Data {
  split?: () => unknown;
  weights?: () => unknown;
  exercises?: unknown[];
  sets?: () => unknown;
  /** While `now` is true, today's own sources fail: a refetch after the data arrived. */
  down?: { now: boolean };
}

/** The sources Home shows a failure for, which a flaky refetch can fail. */
const REFETCHED = ["/api/weight", "/api/nutrition/diary", "/api/nutrition/targets", "/api/exercises", "/api/workouts/session?", "/api/workouts/sets"];

/** By path, longest prefix first (CLAUDE.md). Returns every path asked for. */
function mockApi(d: Data = {}) {
  const calls: string[] = [];
  const routes: [string, () => unknown][] = [
    ["/api/split", d.split ?? (() => DEFAULT_SPLIT)],
    ["/api/workouts/sessions", () => []],
    ["/api/workouts/session?", () => ({ id: "s1", user_id: "u1", date: WED, day_type: 1, day_name: "Legs", notes: null, created_at: "" })],
    ["/api/workouts/sets", d.sets ?? (() => [])],
    ["/api/exercises", () => d.exercises ?? [exercise("Squat"), exercise("Lunge")]],
    ["/api/weight", d.weights ?? (() => [])],
    ["/api/nutrition/diary", () => []],
    ["/api/nutrition/targets", () => []],
    ["/api/goals", () => []],
  ];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    if (d.down?.now && REFETCHED.some((p) => path.startsWith(p))) throw new ApiError(500, "down");
    const hit = routes.find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unexpected ${path}`);
    return (await hit[1]()) as never;
  });
  return calls;
}

function client(): QueryClient {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  return qc;
}

function run(today: string) {
  const qc = client();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useHomeDay(today), { wrapper }), qc };
}

function freeze(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, 12));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useHomeDay (redesign part 2, §3)", () => {
  it("puts the weigh-in on top until today has one", async () => {
    freeze(WED);
    mockApi({ weights: () => [weighIn("2026-08-25")] });
    const { result } = run(WED);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.top).toBe("weigh-in");
  });

  it("puts the workout on top once weighed in, with its progress", async () => {
    freeze(WED);
    mockApi({ weights: () => [weighIn(WED)], sets: () => [set("Squat"), set("Squat")] });
    const { result } = run(WED);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.top).toBe("workout");
    expect(result.current.workout.progress).toEqual({ total: 2, done: 1, sets: 2, started: true, finished: false });
  });

  it("hands over to food once every exercise has a set", async () => {
    freeze(WED);
    mockApi({ weights: () => [weighIn(WED)], sets: () => [set("Squat"), set("Lunge")] });
    const { result } = run(WED);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.top).toBe("food");
  });

  // Review focus 4.
  it("skips the workout on a rest day, without asking for a list or sets", async () => {
    freeze(THU);
    const calls = mockApi({ weights: () => [weighIn(THU)] });
    const { result } = run(THU);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.top).toBe("food");
    expect(result.current.workout.isRest).toBe(true);
    expect(calls.some((c) => c.startsWith("/api/exercises") || c.startsWith("/api/workouts/session?"))).toBe(false);
  });

  it("never lets weigh-ins that failed to load claim the slot", async () => {
    freeze(WED);
    mockApi({ weights: () => { throw new ApiError(500, "boom"); } });
    const { result } = run(WED);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.weight.isError).toBe(true);
    expect(result.current.top).toBe("workout");
  });

  // Review focus 1: the slot is a conclusion, so it waits for every source.
  it("stays pending while today's sets are still loading on a training day", async () => {
    freeze(WED);
    mockApi({ weights: () => [weighIn(WED)], sets: NEVER });
    const { result } = run(WED);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.isPending).toBe(true);
  });

  // Final review, important 1. TanStack keeps the data when a refetch fails and
  // still sets isError. A phone refetches on every focus, and one opened with no
  // signal refetches everything, so a failure with the data in hand must not
  // move the slot or turn the sections into "Couldn't load".
  it("keeps the slot and the sections when a refetch fails with the data in hand", async () => {
    freeze(WED);
    const down = { now: false };
    mockApi({ weights: () => [weighIn("2026-08-25")], down });
    const { result, qc } = run(WED);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.top).toBe("weigh-in");

    down.now = true;
    await act(async () => {
      await qc.refetchQueries();
      // Observers hear of it on a later tick; read the hook only after that.
      await new Promise((r) => setTimeout(r, 50));
    });
    // The positive complement: the refetches really did fail, data kept.
    const failed = qc.getQueryCache().getAll().filter((q) => q.state.status === "error");
    expect(failed).toHaveLength(5);
    expect(failed.every((q) => q.state.data !== undefined)).toBe(true);

    expect(result.current.top).toBe("weigh-in");
    expect(result.current.weight.isError).toBe(false);
    expect(result.current.food.isError).toBe(false);
    expect(result.current.workout.isError).toBe(false);
    expect(result.current.workout.progress).not.toBeNull();
  });

  it("stays pending while the split is still loading", async () => {
    freeze(WED);
    mockApi({ split: NEVER, weights: () => [weighIn(WED)] });
    const { result } = run(WED);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.isPending).toBe(true);
  });
});
