import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { shiftISO, type Goal, type RecordEvent, type WeekNumbers, type WeeklyReview } from "@dashboard/shared";
import { InsightsPage } from "../src/features/insights/InsightsPage";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/** Saturday 3 Oct 2026 at local noon: the last full week is 21–27 Sep; this week began on 28 Sep. */
function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 3, 12));
}

const numbers = (over: Partial<WeekNumbers> = {}): WeekNumbers => ({
  training: { days: 4, sets: 38, volume: 9120 },
  food: { daysLogged: 3, avgKcal: 2310, avgProteinG: 168 },
  weight: { average: 78.6, weighIns: 4 },
  ...over,
});
const review = (week: string, over: Partial<WeeklyReview> = {}): WeeklyReview => ({
  week, current: numbers(), trainingTarget: 5, foodTarget: { calories: 2402, proteinG: 180 },
  previous: numbers({ training: { days: 3, sets: 30, volume: 8600 }, weight: { average: 77.8, weighIns: 3 } }),
  days: Array.from({ length: 7 }, (_, i) => ({ date: shiftISO(week, i), trained: i < 4, kcal: 2310, weightKg: 78.6 })),
  ...over,
});
const rec = (date: string, name: string, kg = 105, prev = 100): RecordEvent => ({
  date, exercise_name: name, heaviest: { weightKg: kg, reps: 5, previousKg: prev },
});
const WEIGHT_GOAL: Goal = { id: "g", user_id: "u1", kind: "weight", exercise_name: null, target_kg: 80, start_kg: 76, created_at: "" };

interface Routes { review?: (week: string) => unknown; records?: () => unknown; goals?: () => unknown }
/** By path, longest prefix first. */
function mockApi(r: Routes = {}) {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith("/api/insights/projections")) return [] as never;
    if (path.startsWith("/api/goals")) return (r.goals ? r.goals() : []) as never;
    if (path.startsWith("/api/workouts/exercise-names")) return [] as never;
    if (path.startsWith("/api/insights/review")) {
      const week = new URL(path, "http://x").searchParams.get("week")!;
      return (r.review ? r.review(week) : review(week)) as never;
    }
    if (path.startsWith("/api/insights/records")) return (r.records ? r.records() : []) as never;
    throw new Error(`unexpected ${path}`);
  });
  return calls;
}

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <InsightsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return client;
}

const rowsOf = (name: string) => within(screen.getByRole("list", { name })).getAllByRole("listitem");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("Insights: the week", () => {
  it("opens on the last full week, as three rows", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    expect(await screen.findByText("21–27 Sep")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    expect(screen.getByText("Last week")).toBeInTheDocument();
    expect(calls).toContain("/api/insights/review?week=2026-09-21");
    expect(await screen.findByText("38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
    expect(screen.getByText("of 2,402 · 168 of 180 g protein · 3 days logged")).toBeInTheDocument();
  });

  it("steps back a week, and cannot step past the last full week", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    const next = await screen.findByRole("button", { name: "Next week" });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("14–20 Sep")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
    expect(calls).toContain("/api/insights/review?week=2026-09-14");
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();
  });

  it("moves on to the new last full week when the app wakes on Monday", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    await screen.findByText("21–27 Sep");
    vi.setSystemTime(new Date(2026, 9, 5, 7));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("28 Sep – 4 Oct")).toBeInTheDocument();
    expect(calls).toContain("/api/insights/review?week=2026-09-28");
  });

  it("stays on an earlier week the user stepped back to", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Previous week" }));
    await screen.findByText("14–20 Sep");
    vi.setSystemTime(new Date(2026, 9, 5, 7));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("14–20 Sep")).toBeInTheDocument();
    expect(calls).not.toContain("/api/insights/review?week=2026-09-28");
  });

  // Review focus 1.
  it("waits for the goals before colouring the weight change", async () => {
    freeze();
    let release!: (g: Goal[]) => void;
    mockApi({ goals: () => new Promise<Goal[]>((r) => (release = r)) });
    const client = renderPage();
    // The week has arrived; only the goals are outstanding.
    await waitFor(() => expect(client.getQueryData(["insightsReview", "u1", "2026-09-21"])).toBeDefined());
    expect(screen.queryByText("38 sets · 9,120 kg (+6%)")).toBeNull();
    expect(screen.queryByText("+0.8")).toBeNull();
    await act(async () => release([WEIGHT_GOAL]));
    expect((await screen.findByText("+0.8")).closest("[data-tone]")).toHaveAttribute("data-tone", "good");
  });

  // Final review: offline, with the week saved and goals never loaded, the goals
  // query pauses and stays pending. Waiting for it would spin for good (Weight's rule).
  it("draws the saved week offline when the goals were never loaded", async () => {
    freeze();
    mockApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["insightsReview", "u1", "2026-09-21"], review("2026-09-21"));
    onlineManager.setOnline(false);
    renderPage(client);
    expect(await screen.findByText("38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
  });

  it("shows an error card with Retry when the week cannot load", async () => {
    freeze();
    let fail = true;
    mockApi({ review: (w) => { if (fail) throw new ApiError(500, "Server error"); return review(w); } });
    renderPage();
    expect(await screen.findByText("Could not load this week")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
  });

  it("keeps the week on a failed refresh", async () => {
    freeze();
    let fail = false;
    mockApi({ review: (w) => { if (fail) throw new ApiError(500, "Server error"); return review(w); } });
    const client = renderPage();
    await screen.findByText("38 sets · 9,120 kg (+6%)");
    fail = true;
    await act(() => client.refetchQueries({ queryKey: ["insightsReview"] }));
    expect(await screen.findByText("Couldn't refresh — showing saved data.")).toBeInTheDocument();
    expect(screen.getByText("38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
  });
});

describe("Insights: records", () => {
  it("shows the records set in the week shown, biggest jump first", async () => {
    freeze();
    mockApi({ records: () => [rec("2026-09-24", "Bench", 62.5, 60), rec("2026-09-22", "Squat", 105, 100), rec("2026-09-26", "Curl", 15, 14)] });
    renderPage();
    await screen.findByRole("list", { name: "Records that week" });
    expect(rowsOf("Records that week").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Curl"), expect.stringContaining("Squat"), expect.stringContaining("Bench"),
    ]);
  });

  it("moves the records with the week, and keeps this week's where they are", async () => {
    freeze();
    mockApi({ records: () => [rec("2026-09-24", "Bench"), rec("2026-09-16", "Row"), rec("2026-09-30", "Press")] });
    renderPage();
    expect((await screen.findByRole("list", { name: "This week so far" }))).toHaveTextContent("Press");
    expect(rowsOf("Records that week")[0]).toHaveTextContent("Bench");
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await screen.findByText("14–20 Sep");
    expect(rowsOf("Records that week")[0]).toHaveTextContent("Row");
    expect(screen.getByRole("list", { name: "This week so far" })).toHaveTextContent("Press");
  });

  // Review focus 5.
  it("shows 5, then the rest on N more; changing the week closes it", async () => {
    freeze();
    mockApi({ records: () => Array.from({ length: 8 }, (_, i) => rec("2026-09-23", `Lift ${i}`, 100 + i + 1)) });
    renderPage();
    await screen.findByRole("list", { name: "Records that week" });
    expect(rowsOf("Records that week")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "3 more" }));
    expect(rowsOf("Records that week")).toHaveLength(8);
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await screen.findByText("14–20 Sep");
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    await screen.findByText("21–27 Sep");
    expect(rowsOf("Records that week")).toHaveLength(5);
  });

  it("says when a week, or this week, has none", async () => {
    freeze();
    mockApi();
    renderPage();
    expect(await screen.findByText("No records that week.")).toBeInTheDocument();
    expect(screen.getByText("None yet this week.")).toBeInTheDocument();
  });

  it("keeps the records on a failed refresh", async () => {
    freeze();
    let fail = false;
    mockApi({ records: () => { if (fail) throw new ApiError(500, "Server error"); return [rec("2026-09-24", "Bench")]; } });
    const client = renderPage();
    await screen.findByRole("list", { name: "Records that week" });
    fail = true;
    await act(() => client.refetchQueries({ queryKey: ["insightsRecords"] }));
    expect(await screen.findByText("Couldn't refresh — showing saved data.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Records that week" })).toHaveTextContent("Bench");
    expect(screen.queryByText("Couldn't load records")).toBeNull();
  });

  it("shows the records' failure once, with Retry, and hides this week's block", async () => {
    freeze();
    let fail = true;
    mockApi({ records: () => { if (fail) throw new ApiError(500, "Server error"); return [rec("2026-09-24", "Bench")]; } });
    renderPage();
    expect(await screen.findByText("Couldn't load records")).toBeInTheDocument();
    expect(screen.queryByText("This week so far")).toBeNull();
    fail = false;
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" }).at(-1)!);
    expect(await screen.findByRole("list", { name: "Records that week" })).toHaveTextContent("Bench");
  });
});
