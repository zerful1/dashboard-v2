import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GymPage } from "../src/features/gym/GymPage";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/**
 * GymPage composes useSplit, useGymDay, useExercises, useWorkoutDay and a
 * lastLoggedDay query — five fetches with no serialisation between them. An
 * order-based mock here would be a race, so this matches on path only.
 *
 * Order matters within this list: `/api/workouts/session-detail` must be tested
 * before `/api/workouts/session`, since startsWith would otherwise never reach
 * it. Longest-prefix-first is the safe habit.
 */
const ROUTES: [string, unknown][] = [
  ["/api/split", DEFAULT_SPLIT],
  ["/api/exercises", []],
  ["/api/workouts/session-detail", { sets: [], cardio: [] }],
  ["/api/workouts/sessions", [OLD_SESSION()]],
  ["/api/workouts/session", null],
  ["/api/workouts/sets", []],
  ["/api/workouts/last-times", {}],
  ["/api/workouts/day-names", ["Push"]],
  ["/api/workouts/exercise-names", []],
  ["/api/cardio", []],
];

function OLD_SESSION() {
  // A Push session (day_type 3) on a date that is not today, so a successful
  // hand-off is visible in both the heading and the date control.
  return {
    id: "old-1",
    user_id: "u1",
    date: "2026-05-20",
    day_type: 3,
    day_name: "Push",
    notes: null,
    created_at: "",
  };
}

function mockByPath() {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = ROUTES.find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return hit[1] as never;
  });
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <GymPage />
    </QueryClientProvider>,
  );
  // The visible date label is locale-formatted ("20 May" vs "May 20"), so
  // assertions read the underlying input instead.
  const selectedDate = () =>
    (container.querySelector('input[type="date"]') as HTMLInputElement | null)?.value;
  return { selectedDate, container };
}


afterEach(() => vi.restoreAllMocks());

describe("GymPage sub-tabs and hand-off", () => {
  it("keeps the header visible on every tab", async () => {
    mockByPath();
    const { container } = renderPage();

    // The day and date are the page's context. Hiding them on History would
    // make the hand-off look like it did nothing.
    for (const tab of ["Stats", "History"]) {
      await userEvent.click(await screen.findByRole("button", { name: tab }));
      expect(screen.getByRole("button", { name: /^Training day/ })).toBeInTheDocument();
      expect(container.querySelector('input[type="date"]')).not.toBeNull();
    }
  });

  it("Edit in Log jumps to the session's day AND date, then shows Log", async () => {
    mockByPath();
    const { selectedDate } = renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "History" }));
    await userEvent.click(await screen.findByText("2026-05-20"));
    await userEvent.click(await screen.findByRole("button", { name: /edit in log/i }));

    // Heading follows day_type 3 -> Push, and the date follows the session's
    // date. Both, from one jumpTo — a selectDay that forgot the date would
    // still pass the heading assertion.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Push"),
    );
    expect(selectedDate()).toBe("2026-05-20");
  });

  it("the hand-off survives a late lastLoggedDay resolving", async () => {
    // The v1 bug phase 6 fixed, re-asserted at the page level: jumpTo latches,
    // so the fallback cannot pull the user back to today's rotation slot. A
    // plain selectDay + selectDate pair would not latch and would regress this.
    let resolveLastLogged!: (v: unknown) => void;
    const lastLoggedPromise = new Promise<unknown>((r) => {
      resolveLastLogged = r;
    });
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/sessions?limit=1")) {
        return lastLoggedPromise as never;
      }
      const hit = ROUTES.find(([p]) => path.startsWith(p));
      if (!hit) throw new Error(`unmocked path: ${path}`);
      return hit[1] as never;
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "History" }));
    await userEvent.click(await screen.findByText("2026-05-20"));
    await userEvent.click(await screen.findByRole("button", { name: /edit in log/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Push"),
    );

    // The slow query lands only now, naming a different day.
    resolveLastLogged([{ ...OLD_SESSION(), day_type: 1, day_name: "Legs" }]);

    // Still Push. The latch held.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Push"),
    );
  });
});
