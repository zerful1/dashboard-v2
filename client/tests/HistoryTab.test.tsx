import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryTab } from "../src/features/gym/HistoryTab";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { prettyDate } from "../src/lib/dates";
import * as apiModule from "../src/lib/api";

// Mutable so one test can render with NO user. vi.mock is hoisted above every
// import, so the state it reads has to be hoisted with it.
const auth = vi.hoisted(() => ({
  user: { id: "u1", email: "a@b.com" } as { id: string; email: string } | null,
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: auth.user, loading: false }),
}));

const session = (id: string, date: string, dayName: string, lifts = 5, sets = 16) => ({
  id, user_id: "u1", date, day_type: 1, day_name: dayName, notes: null, created_at: "", lifts, sets,
});
const aSet = (n: number, reps = 5) => ({
  id: `s${n}`, user_id: "u1", session_id: "a", exercise_name: "Squat", set_number: n,
  weight_kg: 100, reps, reps_left: null, reps_right: null, is_bodyweight: false,
});

/**
 * By path, longest prefix first. The grid asks for sessions with `since`, and
 * the list without, so one sessions route answers both from what it is asked.
 */
function mockByPath(routes: { list?: unknown[]; grid?: unknown[]; detail?: unknown; dayNames?: string[] }) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/split")) return DEFAULT_SPLIT as never;
    if (path.startsWith("/api/workouts/day-names")) return (routes.dayNames ?? ["Legs"]) as never;
    if (path.startsWith("/api/workouts/session-detail")) return (routes.detail ?? { sets: [], cardio: [] }) as never;
    if (path.startsWith("/api/workouts/sessions")) return (path.includes("since=") ? routes.grid ?? [] : routes.list ?? []) as never;
    throw new Error(`unmocked path: ${path}`);
  });
}

function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 26, 12)); // Wed 2026-08-26
}

function renderTab(onEdit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <HistoryTab onEditInLog={onEdit} />
    </QueryClientProvider>,
  );
  return onEdit;
}

const grid = () => within(screen.getByRole("group", { name: /last 12 weeks/i }));

afterEach(() => {
  auth.user = { id: "u1", email: "a@b.com" };
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("History, the list (redesign part 3b, §5)", () => {
  it("lists sessions with their lifts and sets, and Cardio for one without sets", async () => {
    mockByPath({ list: [session("a", "2026-08-16", "Legs"), session("b", "2026-08-15", "Push", 0, 0)] });
    renderTab();
    expect(await screen.findByText(prettyDate("2026-08-16"))).toBeInTheDocument();
    expect(screen.getByText("5 lifts · 16 sets")).toBeInTheDocument();
    expect(screen.getByText("Cardio")).toBeInTheDocument();
  });

  it("shows Loading, not the empty state, while the query is disabled", async () => {
    auth.user = null;
    mockByPath({});
    renderTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/No sessions logged yet/)).toBeNull();
  });

  it("surfaces retired split names as chips without a hardcoded list", async () => {
    mockByPath({ dayNames: ["Legs", "Upper A"] });
    renderTab();
    expect(await screen.findByRole("button", { name: "Upper A" })).toBeInTheDocument();
  });
});

describe("History, the 12-week grid (redesign part 3b, §5)", () => {
  it("shows the weekly average against the split's aim", async () => {
    freeze();
    const dates = ["2026-08-24", "2026-08-21", "2026-08-17", "2026-08-10", "2026-08-03", "2026-07-27"];
    mockByPath({ grid: dates.map((d, i) => session(String(i), d, "Pull")) });
    renderTab();
    expect(await screen.findByText("0.5")).toBeInTheDocument();
    expect(screen.getByText(/aim 5/)).toBeInTheDocument();
  });

  it("names each trained day for screen readers, and hides the rest", async () => {
    freeze();
    mockByPath({ grid: [session("a", "2026-08-24", "Pull"), session("b", "2026-08-17", "Legs")] });
    renderTab();
    await screen.findByRole("group", { name: /last 12 weeks/i });
    const days = grid().getAllByRole("button");
    expect(days).toHaveLength(2);
    expect(days[1]).toHaveAccessibleName(`${prettyDate("2026-08-24")}, Pull`);
  });

  it("opens the session from a day with one", async () => {
    freeze();
    mockByPath({ grid: [session("a", "2026-08-24", "Pull")], detail: { sets: [aSet(1)], cardio: [] } });
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: `${prettyDate("2026-08-24")}, Pull` }));
    expect(await screen.findByRole("dialog", { name: `${prettyDate("2026-08-24")} · Pull` })).toBeInTheDocument();
  });

  it("narrows the list to a day with two sessions, and clears it", async () => {
    freeze();
    const two = [session("a", "2026-08-24", "Pull"), session("b", "2026-08-24", "Legs")];
    mockByPath({ grid: two, list: [...two, session("c", "2026-08-20", "Push")] });
    renderTab();
    await screen.findByText(prettyDate("2026-08-20"));
    await userEvent.click(screen.getByRole("button", { name: `${prettyDate("2026-08-24")}, Pull and Legs` }));
    expect(screen.queryByText(prettyDate("2026-08-20"))).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Show every day, not just / }));
    expect(await screen.findByText(prettyDate("2026-08-20"))).toBeInTheDocument();
  });
});

describe("History, the session sheet", () => {
  it("opens with a derived number of set columns", async () => {
    mockByPath({ list: [session("a", "2026-08-16", "Legs")], detail: { sets: [1, 2, 3, 4, 5, 6].map((n) => aSet(n)), cardio: [] } });
    renderTab();
    await userEvent.click(await screen.findByText(prettyDate("2026-08-16")));
    // Six sets means six columns; v1's fixed four would have hidden two.
    expect(await screen.findByRole("columnheader", { name: "6" })).toBeInTheDocument();
  });

  it("hands the session back for editing and closes", async () => {
    mockByPath({ list: [session("a", "2026-08-16", "Legs")] });
    const onEdit = renderTab();
    await userEvent.click(await screen.findByText(prettyDate("2026-08-16")));
    await userEvent.click(await screen.findByRole("button", { name: /edit in log/i }));
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a", date: "2026-08-16", day_type: 1 })),
    );
  });

  it("leaves a gap where a set number is missing rather than shifting later sets left", async () => {
    // Set 2 was deleted, so the row is 1, —, 3. Rendering by position instead
    // of by set_number would show 1, 3 and silently relabel set 3 as set 2.
    mockByPath({ list: [session("a", "2026-08-16", "Legs")], detail: { sets: [aSet(1, 1), aSet(3, 3)], cardio: [] } });
    renderTab();
    await userEvent.click(await screen.findByText(prettyDate("2026-08-16")));
    const row = (await screen.findByText("Squat")).closest("tr")!;
    expect([...row.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["Squat", "100 × 1", "—", "100 × 3"]);
  });
});
