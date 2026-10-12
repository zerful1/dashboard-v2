import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Goal } from "@dashboard/shared";
import { WeightStats } from "../src/features/weight/WeightStats";
import { WeightSection } from "../src/features/home/WeightSection";
import type { WeightSummary } from "../src/features/weight/deriveWeight";
import { useWeightGoalKg } from "../src/hooks/useGoals";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

afterEach(() => vi.restoreAllMocks());

// No points, so the Home sparkline (Recharts) renders nothing in jsdom.
const summary = (over: Partial<WeightSummary>): WeightSummary => ({
  latest: 82, latestDate: "2026-10-06", deltaWeek: -0.6, deltaMonth: -1.8, lowest: 81.5, streak: 4,
  average7: 82.2, fit: { status: "not-enough-data", have: 0, need: 14 }, line: [],
  points: [], trend: [], ...over,
});

/** Every element showing `text`, so a test can read the tone off it. */
const shown = (text: RegExp) => screen.getAllByText(text);
const toneOf = (el: HTMLElement) => el.closest("[data-tone]")?.getAttribute("data-tone");

describe("weight trend tone (redesign spec §5.8)", () => {
  it("colours a change toward the weight goal green on Weight", () => {
    render(<WeightStats summary={summary({ deltaWeek: -0.6 })} goalKg={78} />);
    expect(toneOf(shown(/0\.6 kg/)[0]!)).toBe("good");
    expect(shown(/0\.6 kg/)[0]!.closest("[data-tone]")).toHaveClass("text-good");
  });

  it("leaves a change away from the goal white, never amber or red", () => {
    const { container } = render(<WeightStats summary={summary({ deltaWeek: 0.4, deltaMonth: 1.1 })} goalKg={78} />);
    expect(toneOf(shown(/0\.4 kg/)[0]!)).toBe("neutral");
    expect(container.querySelector(".text-caution, .text-negative, .text-good")).toBeNull();
  });

  it("colours nothing without a goal, but still shows the direction", () => {
    const { container } = render(<WeightStats summary={summary({})} goalKg={null} />);
    expect(container.querySelector(".text-good")).toBeNull();
    expect(screen.getAllByText("▼").length).toBeGreaterThan(0);
  });

  it("colours the Home tile the same way", () => {
    render(
      <MemoryRouter>
        <WeightSection weight={{ summary: summary({ deltaWeek: -0.6 }), goalKg: 78, isError: false }} />
      </MemoryRouter>,
    );
    expect(toneOf(shown(/0\.6 kg in 7 days/)[0]!)).toBe("good");
    expect(shown(/0\.6 kg in 7 days/)[0]!.closest("[data-tone]")).toHaveClass("text-good");
  });

  it("leaves the Home tile neutral without a goal", () => {
    const { container } = render(
      <MemoryRouter>
        <WeightSection weight={{ summary: summary({ deltaWeek: -0.6 }), goalKg: null, isError: false }} />
      </MemoryRouter>,
    );
    expect(container.querySelector(".text-good")).toBeNull();
  });
});

describe("useWeightGoalKg", () => {
  /** By path (CLAUDE.md), never by call order. */
  function mockGoals(goals: Goal[]) {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/goals")) return goals as never;
      throw new Error(`unexpected ${path}`);
    });
  }
  const goal = (over: Partial<Goal>): Goal => ({
    id: "g", user_id: "u1", kind: "weight", exercise_name: null, target_kg: 78, start_kg: 82, created_at: "", ...over,
  });
  function setup() {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrapper };
  }

  it("is the weight goal's target, ignoring lift goals", async () => {
    mockGoals([goal({ id: "l", kind: "lift", exercise_name: "Squat", target_kg: 140 }), goal({})]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useWeightGoalKg(), { wrapper });
    await waitFor(() => expect(result.current).toBe(78));
  });

  it("is null with no weight goal", async () => {
    mockGoals([goal({ kind: "lift", exercise_name: "Squat", target_kg: 140 })]);
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useWeightGoalKg(), { wrapper });
    // Wait for the goals to ARRIVE: null before they load proves nothing.
    await waitFor(() => expect(client.getQueryData(["goals", "u1"])).toBeDefined());
    expect(result.current).toBeNull();
  });
});
