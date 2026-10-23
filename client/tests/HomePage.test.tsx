import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { HomePage } from "../src/pages/HomePage";
import { AuthProvider } from "../src/auth/AuthProvider";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import type { WorkoutSession } from "@dashboard/shared";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

// DEFAULT_SPLIT.week is [3,2,1,'rest',5,4,'rest'] Monday-first, and its days are
// 1=Legs 2=Pull 3=Push 4=Lower 5=Upper. So Wednesday is Legs and Thursday rests.
const WED = "2026-08-26";
const THU = "2026-08-27";

/** Local noon, so the local calendar day is unambiguous in any timezone. */
function freeze(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, 12));
}

const session = (date: string, dayType: number, dayName: string, id = `s-${date}`): WorkoutSession => ({
  id, user_id: "1", date, day_type: dayType, day_name: dayName, notes: null, created_at: "",
});
const weighIn = (date: string, kg = 80.6) => ({ id: `w-${date}`, user_id: "1", date, weight_kg: kg, notes: null, created_at: "" });
const exercise = (name: string) => ({ id: name, user_id: "1", day_type: 1, exercise_name: name, sort_order: 1 });
const set = (name: string) => ({
  id: `${name}-${Math.random()}`, user_id: "1", session_id: "s1", exercise_name: name, set_number: 1,
  weight_kg: 100, reps: 5, reps_left: null, reps_right: null, is_bodyweight: false,
});
const TARGET = {
  id: "t1", user_id: "1", effective_from: "2026-01-01", goal_mode: "cut", calories: 2300,
  protein_g: 170, fat_g: 70, carbs_g: 230, created_at: "",
};

function client(): QueryClient {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  return qc;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client()}>
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

interface Overrides {
  splitNeverResolves?: boolean;
  splitFails?: boolean;
  sessions?: WorkoutSession[];
  weights?: unknown[] | Error;
  exercises?: unknown[];
  sets?: unknown[];
  targets?: unknown[];
  habits?: unknown[];
  cardio?: unknown[];
  /** Answers POST /api/weight in its place, e.g. a failure the test releases. */
  weighInResult?: () => Promise<unknown>;
}

/**
 * Mocks by METHOD and PATH, never by call order: Home fires a dozen requests
 * with no serialisation between them. Longest prefix first, so
 * `/api/workouts/sessions` and `/api/workouts/session?` never swallow each other.
 */
function mockApi(o: Overrides = {}) {
  const calls: { key: string; body?: unknown }[] = [];
  // Stateful, so the refetch after a weigh-in sees it: a mock that kept
  // answering with yesterday would hand the slot straight back to the weigh-in.
  const state = { weights: o.weights };
  const routes: [string, (body?: { date: string; weight_kg: number }) => unknown][] = [
    ["GET /api/auth/me", () => ({ id: "1", email: "you@example.com" })],
    ["GET /api/profile", () => ({ user_id: "1", timezone: "Europe/London" })],
    ["GET /api/split", () => {
      if (o.splitFails) throw new ApiError(500, "boom");
      return o.splitNeverResolves ? new Promise(() => {}) : DEFAULT_SPLIT;
    }],
    ["GET /api/workouts/sessions", () => o.sessions ?? []],
    ["GET /api/workouts/session?", () => session(WED, 1, "Legs", "s1")],
    ["GET /api/workouts/sets", () => o.sets ?? []],
    ["GET /api/exercises", () => o.exercises ?? [exercise("Squat"), exercise("Lunge")]],
    ["GET /api/cardio", () => o.cardio ?? []],
    ["POST /api/weight", (body) => {
      if (o.weighInResult) return o.weighInResult();
      const e = weighIn(body!.date, body!.weight_kg);
      state.weights = [e, ...(Array.isArray(state.weights) ? state.weights : [])];
      return e;
    }],
    ["GET /api/weight", () => { if (state.weights instanceof Error) throw state.weights; return state.weights ?? []; }],
    ["GET /api/nutrition/recents", () => []],
    ["GET /api/nutrition/diary", () => []],
    ["GET /api/nutrition/targets", () => o.targets ?? [TARGET]],
    ["GET /api/goals", () => []],
    ["GET /api/habits", () => o.habits ?? []],
  ];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const hit = routes.find(([p]) => key.startsWith(p));
    if (!hit) throw new Error(`unexpected ${key}`);
    return hit[1](body) as never;
  });
  return calls;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HomePage, today at a glance", () => {
  // While auth resolves every query is disabled, and a disabled
  // query reports isLoading false: Home once painted a confident day from
  // DEFAULT_SPLIT and zero sessions, then the spinner, then the truth.
  it("shows no top slot and no day until everything has arrived", async () => {
    freeze(WED);
    mockApi({ weights: [weighIn(WED)] });
    renderPage();
    expect(screen.getByLabelText(/loading your day/i)).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
    expect(await screen.findByRole("link", { name: /start workout/i })).toBeInTheDocument();
  });

  it("waits for the SPLIT before naming a day", async () => {
    // useSplit returns DEFAULT_SPLIT until it loads, so an unloaded split names
    // a real but WRONG day on a customised split.
    freeze(WED);
    const calls = mockApi({ weights: [weighIn(WED)], splitNeverResolves: true });
    renderPage();
    // Let every other source be asked and answered first. Until Home's own
    // queries start, the spinner is up for sign-in, and the guard holds either way.
    await waitFor(() =>
      expect(
        ["GET /api/workouts/sessions", "GET /api/weight", "GET /api/nutrition/diary", "GET /api/nutrition/targets", "GET /api/goals"]
          .every((p) => calls.some((c) => c.key.startsWith(p))),
      ).toBe(true),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByLabelText(/loading your day/i)).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
  });

  it("puts the weigh-in on top until today has one", async () => {
    freeze(WED);
    mockApi({ weights: [weighIn("2026-08-25", 81)] });
    renderPage();
    expect(await screen.findByLabelText("Today's weight (kg)")).toBeInTheDocument();
    expect(screen.getByText(/Last: 81\.0 kg yesterday/)).toBeInTheDocument();
    // The workout waits below with an outlined Start.
    expect(screen.getByRole("link", { name: /^start$/i })).toBeInTheDocument();
  });

  // The hand-over happens without a refresh.
  it("logs a weight from Home against today, and hands the top slot to the workout", async () => {
    freeze(WED);
    const calls = mockApi({ weights: [weighIn("2026-08-25", 81)] });
    renderPage();
    await userEvent.type(await screen.findByLabelText("Today's weight (kg)"), "80.6");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(calls.find((c) => c.key === "POST /api/weight")?.body).toEqual({ date: WED, weight_kg: 80.6 });
    expect(await screen.findByRole("link", { name: /start workout/i })).toBeInTheDocument();
  });

  // The optimistic weigh-in hands the slot to the workout,
  // unmounting the field; the rollback hands it back, and the field remounts.
  // The failure is held until the field has gone: one that rejects at once rolls
  // back before React draws the optimistic weigh-in, so the field never unmounts
  // and the test passed with no fix at all.
  it("gives a failed weigh-in its typed value back", async () => {
    freeze(WED);
    let fail!: () => void;
    mockApi({
      weights: [weighIn("2026-08-25", 81)],
      weighInResult: () => new Promise((_, reject) => (fail = () => reject(new ApiError(500, "boom")))),
    });
    renderPage();
    await userEvent.type(await screen.findByLabelText("Today's weight (kg)"), "80.4");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(await screen.findByRole("link", { name: /start workout/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Today's weight (kg)")).toBeNull();
    await act(async () => fail());
    await waitFor(() => expect(screen.getByLabelText("Today's weight (kg)")).toHaveValue("80.4"));
  });

  // The habits card once mounted after the spinner, so its
  // query started last and the card popped in after everything else.
  it("starts today's habits with the rest of the day, not after it", async () => {
    freeze(WED);
    const calls = mockApi({ weights: [weighIn(WED)], splitNeverResolves: true });
    renderPage();
    await waitFor(() => expect(calls.some((c) => c.key === "GET /api/split")).toBe(true));
    expect(screen.getByLabelText(/loading your day/i)).toBeInTheDocument();
    await waitFor(() => expect(calls.map((c) => c.key)).toContain(`GET /api/habits?today=${WED}`));
  });

  it("puts the workout on top once weighed in, with its progress", async () => {
    freeze(WED);
    mockApi({ weights: [weighIn(WED)], sets: [set("Squat"), set("Squat")] });
    renderPage();
    expect(await screen.findByRole("link", { name: /continue workout/i })).toHaveAttribute("href", "/gym");
    expect(screen.getByText("1 of 2 exercises · 2 sets")).toBeInTheDocument();
  });

  it("puts food on top once every exercise has a set, and shows the workout done", async () => {
    freeze(WED);
    mockApi({ weights: [weighIn(WED)], sets: [set("Squat"), set("Lunge")] });
    renderPage();
    expect(await screen.findByText("Legs · done")).toBeInTheDocument();
    expect(screen.getByText(/kcal left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add food" })).toBeInTheDocument();
  });

  it("skips the workout on a rest day", async () => {
    freeze(THU);
    mockApi({ weights: [weighIn(THU)] });
    renderPage();
    expect(await screen.findByText("Rest day")).toBeInTheDocument();
    // A rest day is not a task. A button here would invent one.
    expect(screen.queryByRole("link", { name: /start|continue/i })).toBeNull();
  });

  it("opens Add food on Home", async () => {
    freeze(THU);
    mockApi({ weights: [weighIn(THU)] });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add food" }));
    expect(await screen.findByRole("dialog", { name: "Add food" })).toBeInTheDocument();
  });

  it("shows kcal eaten and Set targets without a target", async () => {
    freeze(THU);
    mockApi({ weights: [weighIn(THU)], targets: [] });
    renderPage();
    expect(await screen.findByText(/kcal eaten/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set targets" })).toHaveAttribute("href", "/nutrition");
  });

  it("never lets weigh-ins that failed to load claim the top slot", async () => {
    freeze(WED);
    mockApi({ weights: new ApiError(500, "boom") });
    renderPage();
    expect(await screen.findByRole("link", { name: /start workout/i })).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your weight.")).toBeInTheDocument();
  });

  // Deferred from #31: the default split named today's workout when the real one failed.
  it("names no workout and no weekly target when the split fails to load", async () => {
    freeze(WED);
    mockApi({ splitFails: true, weights: [weighIn(WED)], sessions: [session("2026-08-24", 3, "Push")] });
    renderPage();
    expect(await screen.findByText("Couldn't load your workout.")).toBeInTheDocument();
    expect(screen.getByText(/This week · 1 session$/)).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
  });

  it("counts the week", async () => {
    freeze(WED);
    // Mon and Tue of this week; DEFAULT_SPLIT has five training days.
    mockApi({ weights: [weighIn(WED)], sessions: [session("2026-08-25", 2, "Pull"), session("2026-08-24", 3, "Push")] });
    renderPage();
    expect(await screen.findByText(/2 of 5 sessions/)).toBeInTheDocument();
  });

  it("shows today's habits", async () => {
    freeze(WED);
    mockApi({
      weights: [weighIn(WED)],
      habits: [{ id: "h1", user_id: "1", name: "Skincare", emoji: null, sort_order: 1, created_at: "", streak: 0, recent: [] }],
    });
    renderPage();
    expect(await screen.findByRole("button", { name: "Mark Skincare done" })).toBeInTheDocument();
  });

  // One filled white action in every state.
  it.each<[string, Overrides]>([
    ["weigh-in", { weights: [weighIn("2026-08-25")] }],
    ["workout", { weights: [weighIn(WED)] }],
    ["food", { weights: [weighIn(WED)], sets: [set("Squat"), set("Lunge")] }],
  ])("keeps exactly one white action with the %s on top", async (_name, data) => {
    freeze(WED);
    mockApi(data);
    const { container } = renderPage();
    await waitFor(() => expect(screen.queryByLabelText(/loading your day/i)).toBeNull());
    expect(container.querySelectorAll("button.bg-accent, a.bg-accent")).toHaveLength(1);
    cleanup();
  });

  // An app left open rolls to the new day.
  it("rolls over at midnight, and puts the weigh-in back on top", async () => {
    freeze(WED);
    mockApi({ weights: [weighIn(WED)] });
    renderPage();
    expect(await screen.findByRole("link", { name: /start workout/i })).toBeInTheDocument();
    vi.setSystemTime(new Date(2026, 7, 27, 7));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByLabelText("Today's weight (kg)")).toBeInTheDocument();
  });

  it("shows a cardio-only day as done, and puts food on top", async () => {
    freeze(WED);
    mockApi({
      weights: [weighIn(WED)],
      cardio: [{ id: "c1", user_id: "1", session_id: "s1", exercise: "Treadmill", distance_miles: null, duration_minutes: 20, speed: null, incline: null, calories_burned: null }],
    });
    renderPage();
    expect(await screen.findByText("Legs · done")).toBeInTheDocument();
    expect(screen.getByText("Cardio only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add food" })).toBeInTheDocument();
  });
});
