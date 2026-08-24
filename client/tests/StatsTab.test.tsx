import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsTab } from "../src/features/gym/StatsTab";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

function mockByPath(routes: Record<string, unknown>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return hit[1] as never;
  });
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StatsTab />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("StatsTab", () => {
  it("prompts when there is no history", async () => {
    mockByPath({ "/api/workouts/exercise-names": [] });
    renderTab();
    expect(await screen.findByText(/log some sets/i)).toBeInTheDocument();
  });

  it("defaults to the first exercise and shows its stats", async () => {
    mockByPath({
      "/api/workouts/exercise-names": ["Bench Press", "Squat"],
      "/api/workouts/stats": {
        sets: [{ session_id: "s1", weight_kg: 85, reps: 5, is_bodyweight: false }],
        sessionDates: { s1: "2026-08-16" },
      },
    });
    renderTab();

    await waitFor(() =>
      expect((screen.getByLabelText("Exercise") as HTMLSelectElement).value).toBe("Bench Press"),
    );
    expect(await screen.findByText("85kg × 5")).toBeInTheDocument();
  });

  it("switches exercise on selection", async () => {
    mockByPath({
      "/api/workouts/exercise-names": ["Bench Press", "Squat"],
      "/api/workouts/stats": {
        sets: [{ session_id: "s1", weight_kg: 85, reps: 5, is_bodyweight: false }],
        sessionDates: { s1: "2026-08-16" },
      },
    });
    renderTab();

    const select = await screen.findByLabelText("Exercise");
    await userEvent.selectOptions(select, "Squat");
    expect((select as HTMLSelectElement).value).toBe("Squat");
  });

  it("shows reps rather than a 1RM for a bodyweight-only exercise", async () => {
    mockByPath({
      "/api/workouts/exercise-names": ["Pull Up"],
      "/api/workouts/stats": {
        sets: [{ session_id: "s1", weight_kg: 0, reps: 12, is_bodyweight: true }],
        sessionDates: { s1: "2026-08-16" },
      },
    });
    renderTab();

    expect(await screen.findByText("Best set")).toBeInTheDocument();
    expect(screen.getByText("12 reps")).toBeInTheDocument();
    expect(screen.queryByText(/est\. 1rm/i)).toBeNull();
  });

  it("lists every name it is given, including ones not in any template", async () => {
    // The point of sourcing names from workout_sets: a pruned exercise stays
    // reachable. The template has 28 rows; history spans more.
    mockByPath({
      "/api/workouts/exercise-names": ["Cable Fly", "Retired Machine Row", "Squat"],
      "/api/workouts/stats": { sets: [], sessionDates: {} },
    });
    renderTab();

    const select = (await screen.findByLabelText("Exercise")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      "Cable Fly",
      "Retired Machine Row",
      "Squat",
    ]);
  });
});
