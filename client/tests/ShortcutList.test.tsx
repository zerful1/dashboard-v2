import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Goal, HabitSummary, NutritionTarget, SplitConfig } from "@dashboard/shared";
import { ShortcutList } from "../src/features/settings/ShortcutList";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const TODAY = "2026-10-16";
const SPLIT: SplitConfig = {
  days: [{ day_type: 1, label: "Push" }, { day_type: 2, label: "Pull" }],
  week: [1, 2, "rest", 1, 2, 1, "rest"],
};
const target = (effective_from: string): NutritionTarget => ({
  id: "t", user_id: "u1", effective_from, goal_mode: "cut", calories: 2402, protein_g: 180, fat_g: 80, carbs_g: 200, created_at: "",
});
const GOALS: Goal[] = [{ id: "g", user_id: "u1", kind: "weight", exercise_name: null, target_kg: 78, start_kg: 80, created_at: "" }];
const HABITS = [{ id: "h1" }, { id: "h2" }] as HabitSummary[];

/** By path, longest prefix first. `split: null` never answers. */
function mockApi({ split = SPLIT as SplitConfig | null, targets = [target("2026-06-09")] } = {}) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/split")) return (split ?? new Promise(() => {})) as never;
    if (path.startsWith("/api/nutrition/targets")) return targets as never;
    if (path.startsWith("/api/goals")) return GOALS as never;
    if (path.startsWith("/api/habits")) return HABITS as never;
    throw new Error(`unexpected ${path}`);
  });
}

function renderList() {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ShortcutList today={TODAY} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ShortcutList", () => {
  it("links each row to where it is changed", async () => {
    mockApi();
    renderList();
    expect(await screen.findByRole("link", { name: /Gym split/ })).toHaveAttribute("href", "/gym?open=split");
    expect(screen.getByRole("link", { name: /Food targets/ })).toHaveAttribute("href", "/nutrition?open=targets");
    expect(screen.getByRole("link", { name: /Goals/ })).toHaveAttribute("href", "/insights?open=goals");
    expect(screen.getByRole("link", { name: /Habits/ })).toHaveAttribute("href", "/habits");
  });

  it("shows each current value", async () => {
    mockApi();
    renderList();
    expect(await screen.findByText("5 days, rest Wed · Sun")).toBeInTheDocument();
    expect(await screen.findByText("2,402 kcal · 180 g protein")).toBeInTheDocument();
    expect(await screen.findByText("78 kg")).toBeInTheDocument();
    expect(await screen.findByText("2 habits")).toBeInTheDocument();
  });

  // Review focus 1: useSplit answers DEFAULT_SPLIT until the real one loads.
  it("leaves a value blank while it loads, never the default split's", async () => {
    mockApi({ split: null });
    renderList();
    // The others arrive; the split's row still says only its name.
    expect(await screen.findByText("2 habits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gym split/ })).toHaveTextContent(/^Gym split$/);
  });

  // Review focus 5.
  it("reads Not set for a target that starts after today", async () => {
    mockApi({ targets: [target("2026-10-20")] });
    renderList();
    expect(await screen.findByText("Not set")).toBeInTheDocument();
  });
});
