import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Goal, Projection } from "@dashboard/shared";
import { GoalsSection } from "../src/features/insights/GoalsSection";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const goal = (over: Partial<Goal>): Goal => ({
  id: "g1", user_id: "u1", kind: "weight", exercise_name: null, target_kg: 75, start_kg: 79, created_at: "", ...over,
});
const HISTORY = ["Lat Pulldown", "T Bar Row", "Seated Cable Row"];

/** By method and path, longest prefix first. */
function mockApi(goals: Goal[], projections: Projection[]) {
  const calls: { key: string; body?: unknown }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (key.startsWith("GET /api/insights/projections")) return projections as never;
    if (key.startsWith("GET /api/goals")) return goals as never;
    if (key.startsWith("PUT /api/goals/weight")) return goal({}) as never;
    if (key.startsWith("POST /api/goals/lifts")) return goal({ id: "new", kind: "lift" }) as never;
    if (key.startsWith("DELETE /api/goals/")) return undefined as never;
    throw new Error(`unexpected ${key}`);
  });
  return calls;
}

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GoalsSection today="2026-09-30" historyNames={HISTORY} />
    </QueryClientProvider>,
  );
}

/** The forms live in the sheet now: open it first. */
async function openSheet() {
  await userEvent.click(await screen.findByRole("button", { name: /^(Change|Set goals)$/ }));
}

afterEach(() => vi.restoreAllMocks());

describe("GoalsSection", () => {
  it("shows each goal with its projection sentence", async () => {
    mockApi(
      [goal({}), goal({ id: "g2", kind: "lift", exercise_name: "Lat Pulldown", target_kg: 75, start_kg: 66 })],
      [
        { goalId: "g1", status: "projected", date: "2026-11-09", ratePerWeek: -0.4, current: 78 },
        { goalId: "g2", status: "not-enough-data", have: 4, need: 6 },
      ],
    );
    renderSection();
    expect(await screen.findByText("around 9 Nov · −0.4 kg a week")).toBeInTheDocument();
    expect(screen.getByText("Lat Pulldown → 75 kg")).toBeInTheDocument();
    expect(screen.getByText("Not enough data yet (4 of 6 sessions)")).toBeInTheDocument();
  });

  // Part 2 review: the projections query opts out of the toast, so the section
  // must show its failure itself, or every goal reads "…" for good.
  it("says when projections could not load, and retries", async () => {
    let fail = true;
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/insights/projections")) {
        if (fail) throw new ApiError(500, "Server error");
        return [{ goalId: "g1", status: "reached", current: 75 }] as never;
      }
      if (path.startsWith("/api/goals")) return [goal({})] as never;
      throw new Error(`unexpected ${path}`);
    });
    renderSection();
    expect(await screen.findByText("Couldn't load projections")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Reached")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load projections")).toBeNull();
  });

  it("saves a target weight", async () => {
    const calls = mockApi([], []);
    renderSection();
    await openSheet();
    await userEvent.type(await screen.findByLabelText("Target weight (kg)"), "74.5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(calls).toContainEqual({ key: "PUT /api/goals/weight", body: { target_kg: 74.5 } });
  });

  it("adds a lift goal in the history's spelling", async () => {
    const calls = mockApi([], []);
    renderSection();
    await openSheet();
    await userEvent.type(await screen.findByLabelText("Lift"), "lat pulldown");
    await userEvent.type(screen.getByLabelText("Target (kg)"), "75");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(calls).toContainEqual({ key: "POST /api/goals/lifts", body: { exercise_name: "Lat Pulldown", target_kg: 75 } });
  });

  // Review focus 4: the form goes away at the limit.
  it("hides the add form at 5 lift goals", async () => {
    const lifts = ["A", "B", "C", "D", "E"].map((n, i) => goal({ id: `l${i}`, kind: "lift", exercise_name: n }));
    mockApi(lifts, []);
    renderSection();
    await openSheet();
    expect((await screen.findAllByText("E → 75 kg")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Lift")).toBeNull();
    expect(screen.getByText("5 of 5 lift goals")).toBeInTheDocument();
  });

  it("removes a lift goal", async () => {
    const calls = mockApi([goal({ id: "g2", kind: "lift", exercise_name: "Lat Pulldown" })], []);
    renderSection();
    await openSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Remove Lat Pulldown goal" }));
    expect(calls.map((c) => c.key)).toContain("DELETE /api/goals/g2");
  });

  it("keeps the forms in a sheet, behind Change", async () => {
    mockApi([goal({})], []);
    renderSection();
    expect(await screen.findByText("Weight → 75 kg")).toBeInTheDocument();
    expect(screen.queryByLabelText("Target weight (kg)")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("dialog", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByLabelText("Target weight (kg)")).toBeInTheDocument();
  });

  it("says there are no goals yet, and offers to set them", async () => {
    mockApi([], []);
    renderSection();
    expect(await screen.findByText("No goals yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set goals" })).toBeInTheDocument();
  });

  it("stays open after a save, and closes on Done", async () => {
    const calls = mockApi([], []);
    renderSection();
    await openSheet();
    await userEvent.type(screen.getByLabelText("Target weight (kg)"), "74.5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(calls).toContainEqual({ key: "PUT /api/goals/weight", body: { target_kg: 74.5 } });
    expect(screen.getByRole("dialog", { name: "Goals" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goals" })).toBeNull());
  });
});
