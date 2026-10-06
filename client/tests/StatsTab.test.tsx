import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { LiftProgress, LiftSetRow } from "@dashboard/shared";
import { StatsTab } from "../src/features/gym/StatsTab";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const best = (weight_kg: number, reps: number, date = "2026-10-02") =>
  ({ date, weight_kg, reps, reps_left: null, reps_right: null, is_bodyweight: false });
const lift = (name: string, over: Partial<LiftProgress>): LiftProgress => ({
  name, status: "stalled", best: best(70, 8), change: null, weeksSinceBest: null, lastDate: "2026-10-02", ...over,
});
const LIFTS: LiftProgress[] = [
  lift("Lat Pulldown", { status: "moving", change: 0.04, best: best(75, 8) }),
  lift("Chest Fly", { status: "new" }),
  lift("Preacher Curl", { status: "stalled", weeksSinceBest: 7 }),
  lift("Face Pull", { status: "back", change: -0.06 }),
  lift("Seated Row (old)", { status: "old", best: null, lastDate: "2025-03-02" }),
];
const row = (date: string, weight: number, reps: number, set_number = 1, session = date): LiftSetRow => ({
  session_id: session, date, exercise_name: "Lat Pulldown", set_number, weight_kg: weight, reps,
  reps_left: null, reps_right: null, is_bodyweight: false,
});

/** By path, longest prefix first. A function answers per call. */
function mockApi(routes: Record<string, unknown | (() => unknown)>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return (typeof hit[1] === "function" ? await (hit[1] as () => unknown)() : hit[1]) as never;
  });
}

function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12)); // Tue 2026-10-06
}

function renderTab() {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  render(
    <QueryClientProvider client={qc}>
      <StatsTab />
    </QueryClientProvider>,
  );
}

const group = (name: string) => within(screen.getByRole("region", { name }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Stats, the overview (redesign part 3b, §3)", () => {
  it("groups lifts as moving, stalled and going back, with their badges", async () => {
    mockApi({ "/api/workouts/progress": LIFTS });
    renderTab();
    await screen.findByRole("region", { name: "Moving" });
    expect(group("Moving").getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Lat Pulldown"),
      expect.stringContaining("Chest Fly"),
    ]);
    expect(group("Moving").getByText("▲ 4%")).toBeInTheDocument();
    expect(group("Moving").getByText("New")).toBeInTheDocument();
    expect(group("Stalled").getByText("No best in 7 wk")).toBeInTheDocument();
    expect(group("Going back").getByText("▼ 6%")).toBeInTheDocument();
    expect(screen.getByText(/Best 75 × 8/)).toBeInTheDocument();
  });

  // Review focus 1.
  it("folds lifts not trained lately away, and unfolds them on tap", async () => {
    mockApi({ "/api/workouts/progress": LIFTS });
    renderTab();
    const fold = await screen.findByRole("button", { name: /Not lately · 1/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Seated Row (old)")).toBeNull();
    await userEvent.click(fold);
    expect(screen.getByText("Seated Row (old)")).toBeInTheDocument();
    expect(screen.getByText(/^Last /)).toBeInTheDocument();
  });

  it("leaves out an empty group", async () => {
    mockApi({ "/api/workouts/progress": LIFTS.filter((l) => l.status !== "back") });
    renderTab();
    await screen.findByRole("region", { name: "Moving" });
    expect(screen.queryByRole("region", { name: "Going back" })).toBeNull();
  });

  // Review focus 5.
  it("searches across every group, Not lately included", async () => {
    mockApi({ "/api/workouts/progress": LIFTS });
    renderTab();
    await userEvent.type(await screen.findByRole("textbox", { name: "Search lifts" }), "row");
    expect(screen.getByText("Seated Row (old)")).toBeInTheDocument();
    expect(screen.queryByText("Lat Pulldown")).toBeNull();
    expect(screen.queryByRole("region", { name: "Moving" })).toBeNull();
  });

  it("says when nothing matches the search", async () => {
    mockApi({ "/api/workouts/progress": LIFTS });
    renderTab();
    await userEvent.type(await screen.findByRole("textbox", { name: "Search lifts" }), "zzz");
    expect(screen.getByText(/No lifts match/)).toBeInTheDocument();
  });

  it("prompts when there are no lifts", async () => {
    mockApi({ "/api/workouts/progress": [] });
    renderTab();
    expect(await screen.findByText("Log some sets and your lifts will show here.")).toBeInTheDocument();
  });

  it("shows the spinner, not the empty state, while loading", async () => {
    mockApi({ "/api/workouts/progress": () => new Promise(() => {}) });
    renderTab();
    expect(await screen.findByLabelText(/loading your lifts/i)).toBeInTheDocument();
    expect(screen.queryByText(/Log some sets/)).toBeNull();
  });

  it("says when the lifts fail to load", async () => {
    mockApi({ "/api/workouts/progress": () => { throw new ApiError(500, "boom"); } });
    renderTab();
    expect(await screen.findByText("Couldn't load your lifts.")).toBeInTheDocument();
  });
});

describe("Stats, a lift's detail (redesign part 3b, §4)", () => {
  it("opens a lift, and comes back to the overview with the search kept", async () => {
    freeze();
    mockApi({ "/api/workouts/progress": LIFTS, "/api/workouts/stats": [row("2026-10-02", 75, 8)] });
    renderTab();
    await userEvent.type(await screen.findByRole("textbox", { name: "Search lifts" }), "lat");
    await userEvent.click(screen.getByRole("button", { name: /Lat Pulldown/ }));
    expect(await screen.findByRole("heading", { name: "Lat Pulldown" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /All lifts/ }));
    expect(await screen.findByRole("textbox", { name: "Search lifts" })).toHaveValue("lat");
  });

  it("shows the best, and the all-time line only when it is higher", async () => {
    freeze();
    mockApi({
      "/api/workouts/progress": LIFTS,
      "/api/workouts/stats": [row("2025-03-14", 100, 5), row("2026-09-01", 70, 8), row("2026-10-02", 75, 8)],
    });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: /Lat Pulldown/ }));
    expect(within(await screen.findByRole("region", { name: "Best" })).getByText("75 × 8")).toBeInTheDocument();
    expect(screen.getByText(/All-time: 100 × 5/)).toBeInTheDocument();
  });

  it("leaves the all-time line out when the span holds the best", async () => {
    freeze();
    mockApi({ "/api/workouts/progress": LIFTS, "/api/workouts/stats": [row("2026-09-01", 70, 8), row("2026-10-02", 75, 8)] });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: /Lat Pulldown/ }));
    expect(within(await screen.findByRole("region", { name: "Best" })).getByText("75 × 8")).toBeInTheDocument();
    expect(screen.queryByText(/All-time/)).toBeNull();
  });

  it("lists five recent sessions set by set, then all of them on Show all", async () => {
    freeze();
    const dates = ["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01", "2026-09-08", "2026-09-15"];
    mockApi({
      "/api/workouts/progress": LIFTS,
      "/api/workouts/stats": dates.flatMap((d) => [row(d, 70, 8, 1), row(d, 70, 7, 2)]),
    });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: /Lat Pulldown/ }));
    const recent = within(await screen.findByRole("region", { name: "Recent sessions" }));
    expect(recent.getByText("Recent sessions · 7 in all")).toBeInTheDocument();
    expect(recent.getAllByText("70 × 8 · 70 × 7")).toHaveLength(5);
    await userEvent.click(recent.getByRole("button", { name: "Show all" }));
    expect(recent.getAllByText("70 × 8 · 70 × 7")).toHaveLength(7);
  });

  it("reads a bodyweight-only lift in reps", async () => {
    freeze();
    const bw = (date: string, reps: number) => ({ ...row(date, 0, reps), is_bodyweight: true });
    mockApi({ "/api/workouts/progress": LIFTS, "/api/workouts/stats": [bw("2026-09-01", 9), bw("2026-10-02", 11)] });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: /Lat Pulldown/ }));
    expect(within(await screen.findByRole("region", { name: "Best" })).getByText("BW × 11")).toBeInTheDocument();
  });

  it("says so when the lift fails to load", async () => {
    freeze();
    mockApi({ "/api/workouts/progress": LIFTS, "/api/workouts/stats": () => { throw new ApiError(500, "boom"); } });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: /Lat Pulldown/ }));
    await waitFor(() => expect(screen.getByText("Couldn't load this lift.")).toBeInTheDocument());
  });
});
