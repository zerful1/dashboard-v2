import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RecordEvent, WeekNumbers, WeeklyReview } from "@dashboard/shared";
import { InsightsPage } from "../src/features/insights/InsightsPage";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/** Saturday 3 Oct 2026 at local noon: the last full week is 21–27 Sep. */
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
  ...over,
});
const record = (i: number): RecordEvent => ({
  date: `2026-09-${String(28 - (i % 28)).padStart(2, "0")}`, exercise_name: `Lift ${i}`,
  heaviest: { weightKg: 60 + i, reps: 8, previousKg: 59 + i },
});

interface Routes { review?: (week: string) => unknown; records?: () => unknown }
/** By path, longest prefix first. */
function mockApi(r: Routes = {}) {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Insights weekly review", () => {
  it("opens on the last full week, with each line against the week before", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    expect(await screen.findByText("21–27 Sep")).toBeInTheDocument();
    expect(calls).toContain("/api/insights/review?week=2026-09-21");
    expect(await screen.findByText("4 of 5 days · 38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
    expect(screen.getByText("3 days logged · avg 2,310 kcal of 2,402 · 168 g protein of 180")).toBeInTheDocument();
    expect(screen.getByText("avg 78.6 kg (+0.8)")).toBeInTheDocument();
  });

  it("says no food was logged instead of showing zero", async () => {
    freeze();
    mockApi({ review: (w) => review(w, { current: numbers({ food: { daysLogged: 0, avgKcal: null, avgProteinG: null } }) }) });
    renderPage();
    expect(await screen.findByText("No food logged")).toBeInTheDocument();
    expect(screen.queryByText(/0 kcal/)).toBeNull();
  });

  it("steps back a week, and cannot step past the last full week", async () => {
    freeze();
    const calls = mockApi();
    renderPage();
    const next = await screen.findByRole("button", { name: "Next week" });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("14–20 Sep")).toBeInTheDocument();
    expect(calls).toContain("/api/insights/review?week=2026-09-14");
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();
  });

  it("shows an error card with Retry when the week cannot load", async () => {
    freeze();
    let fail = true;
    mockApi({ review: (w) => { if (fail) throw new ApiError(500, "Server error"); return review(w); } });
    renderPage();
    expect(await screen.findByText("Could not load this week")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("4 of 5 days · 38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
  });

  // Review focus 5.
  it("keeps the review on a failed refresh", async () => {
    freeze();
    let fail = false;
    mockApi({ review: (w) => { if (fail) throw new ApiError(500, "Server error"); return review(w); } });
    const client = renderPage();
    await screen.findByText("4 of 5 days · 38 sets · 9,120 kg (+6%)");
    fail = true;
    await act(() => client.refetchQueries({ queryKey: ["insightsReview"] }));
    // Wait for the failure to reach the screen: TanStack notifies React on a
    // later tick, so asserting straight after act proves nothing.
    expect(await screen.findByText("Couldn't refresh — showing saved data.")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 days · 38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
    expect(screen.queryByText("Could not load this week")).toBeNull();
  });
});

describe("Insights records", () => {
  it("shows 20 records, then 20 more on Show more", async () => {
    freeze();
    mockApi({ records: () => Array.from({ length: 45 }, (_, i) => record(i)) });
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(20));
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
  });

  it("reads a record as date, exercise and what it beat", async () => {
    freeze();
    mockApi({ records: () => [{ date: "2026-08-24", exercise_name: "Lat Pulldown",
      heaviest: { weightKg: 66, reps: 8, previousKg: 61.3 }, e1rm: { valueKg: 82.5, previousKg: 79 } }] });
    renderPage();
    expect(await screen.findByText("heaviest 66 kg (was 61.3) · est. 1RM 82.5 kg (was 79)")).toBeInTheDocument();
    expect(screen.getByText("Lat Pulldown")).toBeInTheDocument();
  });

  it("keeps the records on a failed refresh", async () => {
    freeze();
    let fail = false;
    mockApi({ records: () => { if (fail) throw new ApiError(500, "Server error"); return [record(1)]; } });
    const client = renderPage();
    await screen.findByText("Lift 1");
    fail = true;
    await act(() => client.refetchQueries({ queryKey: ["insightsRecords"] }));
    expect(await screen.findByText("Couldn't refresh — showing saved data.")).toBeInTheDocument();
    expect(screen.getByText("Lift 1")).toBeInTheDocument();
    expect(screen.queryByText("Could not load records")).toBeNull();
  });

  it("explains an empty feed", async () => {
    freeze();
    mockApi();
    renderPage();
    expect(await screen.findByText("No records yet. They appear when a lift beats its best.")).toBeInTheDocument();
  });
});
