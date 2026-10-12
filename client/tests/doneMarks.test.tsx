import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toLocalISO, type Exercise, type HabitSummary } from "@dashboard/shared";
import { ExerciseRow } from "../src/features/gym/ExerciseRow";
import { HabitRow } from "../src/features/habits/HabitRow";
import { WeekLine } from "../src/features/home/WeekLine";
import { TodayHabitsCard } from "../src/features/habits/TodayHabitsCard";
import { PeriodList } from "../src/features/weight/PeriodList";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

afterEach(() => vi.restoreAllMocks());

const today = toLocalISO();
const habit: HabitSummary = {
  id: "h1", user_id: "u1", name: "Skincare", emoji: null, sort_order: 1, created_at: "", streak: 0, recent: [],
};

/**
 * The resting "not done" mark is the most-used control's idle state, and it
 * must be findable on black, outdoors (final review I2): one ring colour
 * everywhere, `dim`, and a habit's mark shows its content in grey (spec §5.10:
 * "a ring with muted content") rather than an empty circle.
 */
describe("unticked done marks", () => {
  it("rings an unticked gym set in dim", () => {
    const exercise: Exercise = { id: "e1", user_id: "u1", day_type: 1, exercise_name: "Squat", sort_order: 1 };
    const { container } = render(
      <ExerciseRow exercise={exercise} lastSets={[]} todaySets={[]} editMode={false} isFirst isLast
        onOpen={() => {}} onDelete={() => {}} onMove={() => {}} onRename={() => {}} />,
    );
    expect(container.querySelector('[data-part="mark"]')).toHaveClass("border-dim");
  });

  it("rings an unticked day on the habit strip in dim, with its letter in grey", () => {
    const { container } = render(
      <ul><HabitRow habit={habit} days={[today]} today={today} locked={false} onToggle={() => {}} /></ul>,
    );
    expect(container.querySelector('[data-part="mark"]')).toHaveClass("border-dim", "text-muted");
  });

  // The positive complement: Home's week dots already use dim.
  it("rings an unlogged day of the week in dim, on Home's week line", () => {
    const { container } = render(<WeekLine week={{ logged: 0, target: 4, days: [false, false, false, false, false, false, false] }} />);
    expect(container.querySelector('[data-part="mark"]')).toHaveClass("border-dim");
  });

  it("rings an unticked habit on Home in dim, with a grey tick inside", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/habits")) return [habit] as never;
      throw new Error(`unexpected ${path}`);
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TodayHabitsCard />
      </QueryClientProvider>,
    );
    const button = await screen.findByRole("button", { name: "Mark Skincare done" });
    expect(button.querySelector('[data-part="mark"]')).toHaveClass("border-dim", "text-muted");
  });

  it("rings an unweighed day in dim, on Weight's weeks", () => {
    const { container } = render(
      <PeriodList
        rows={[{ kind: "period", start: "2026-10-05", end: "2026-10-11", current: false, average: 82, change: null, weighIns: 1,
          days: ["weighed", "missed", "missed", "missed", "missed", "missed", "missed"] }]}
        kind="week" entries={[]} goalKg={null} today="2026-10-14" open={null} onToggle={() => {}} onSelect={() => {}}
      />,
    );
    expect(container.querySelectorAll('[data-part="mark"]')[1]).toHaveClass("border-dim");
  });
});
