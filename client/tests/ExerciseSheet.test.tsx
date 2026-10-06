import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExerciseSheet } from "../src/features/gym/ExerciseSheet";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const exercise: Exercise = {
  id: "e1",
  user_id: "u1",
  day_type: 1,
  exercise_name: "Squat",
  sort_order: 1,
};
const aSet = (n: number, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${n}`,
  user_id: "u1",
  session_id: "sess",
  exercise_name: "Squat",
  set_number: n,
  weight_kg: 100,
  reps: 5,
  reps_left: null,
  reps_right: null,
  is_bodyweight: false,
  ...over,
});

/**
 * Mocks by path, not by call order. This sheet only fetches coaching today, so
 * order and path happen to coincide — but the pattern is the house rule, and
 * hard-coding a sequence here would break the moment a second query appears.
 */
function mockCoaching(result: unknown) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/workouts/coaching")) return result;
    throw new Error(`unexpected ${path}`);
  });
}

function renderSheet(props: Partial<Parameters<typeof ExerciseSheet>[0]> = {}) {
  const onLogSet = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ExerciseSheet
        exercise={exercise}
        todaySets={[]}
        lastSets={[]}
        onClose={vi.fn()}
        onLogSet={onLogSet}
        onDeleteSet={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onLogSet };
}

afterEach(() => vi.restoreAllMocks());

describe("ExerciseSheet", () => {
  it("logs a weighted set with the next set number", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet({ todaySets: [aSet(1), aSet(2)] });

    await userEvent.type(screen.getByLabelText(/weight/i), "105");
    await userEvent.type(screen.getByLabelText(/reps/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 3/i }));

    expect(onLogSet).toHaveBeenCalledWith(105, 5, false, 3);
  });

  it("continues numbering from the highest existing set, not the count", async () => {
    // Set 2 was deleted; the next must be 4, or it collides with set 3 on
    // UNIQUE (session_id, exercise_name, set_number) and — because the server
    // upserts — silently overwrites it.
    mockCoaching(null);
    const { onLogSet } = renderSheet({ todaySets: [aSet(1), aSet(3)] });

    await userEvent.type(screen.getByLabelText(/weight/i), "100");
    await userEvent.type(screen.getByLabelText(/reps/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 4/i }));

    expect(onLogSet).toHaveBeenCalledWith(100, 5, false, 4);
  });

  it("disables weight and logs 0 for a bodyweight set", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /mark as bodyweight/i }));
    expect(screen.getByLabelText(/weight/i)).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/reps/i), "9");
    await userEvent.click(screen.getByRole("button", { name: /add bw set 1/i }));

    expect(onLogSet).toHaveBeenCalledWith(0, 9, true, 1);
  });

  // Redesign review: a selected toggle dropped its border, so switching one on
  // moved everything below it by 2px. Both states keep a 1px border.
  it("keeps the bodyweight toggle the same size when it is switched on", async () => {
    mockCoaching(null);
    renderSheet();
    const off = screen.getByRole("button", { name: /mark as bodyweight/i });
    expect(off).toHaveClass("border");
    await userEvent.click(off);
    expect(screen.getByRole("button", { name: /bodyweight: on/i })).toHaveClass("border");
  });

  it("requires reps, and requires weight unless bodyweight", async () => {
    mockCoaching(null);
    renderSheet();

    expect(screen.getByRole("button", { name: /add set 1/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/weight/i), "100");
    expect(screen.getByRole("button", { name: /add set 1/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reps/i), "5");
    expect(screen.getByRole("button", { name: /add set 1/i })).toBeEnabled();
  });

  it("renders coaching when the API returns a recommendation", async () => {
    mockCoaching({ tag: "ADD WEIGHT", color: "green", headline: "Add 2.5 kg next session" });
    renderSheet();
    expect(await screen.findByText("Add weight")).toBeInTheDocument();
  });

  it("renders nothing for coaching when the API returns null", async () => {
    mockCoaching(null);
    renderSheet();
    await waitFor(() => expect(screen.queryByText(/Add weight|Repeat|Deload/)).toBeNull());
  });

  it("clears the inputs after logging, ready for the next set", async () => {
    mockCoaching(null);
    renderSheet();

    await userEvent.type(screen.getByLabelText(/weight/i), "100");
    await userEvent.type(screen.getByLabelText(/reps/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 1/i }));

    // Sets are logged in quick succession; leaving the previous values would
    // make the next set silently duplicate this one on a stray tap.
    expect(screen.getByLabelText(/reps/i)).toHaveValue(null);
  });

  const sidedSet = (over: Partial<WorkoutSet> = {}) => aSet(1, { reps: 7, reps_left: 7, reps_right: 8, ...over });
  const toggle = () => screen.getByRole("button", { name: /left \/ right/i });

  it("logs both sides when Left / right is on, and needs both", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet();
    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(/weight/i), "20");
    await userEvent.type(screen.getByLabelText("Left"), "7");
    expect(screen.getByRole("button", { name: /add set 1/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Right"), "8");
    await userEvent.click(screen.getByRole("button", { name: /add set 1/i }));

    expect(onLogSet).toHaveBeenCalledWith(20, { left: 7, right: 8 }, false, 1);
    expect(screen.getByLabelText("Left")).toHaveValue(null);
  });

  it("switches itself on for an exercise named Unilateral", () => {
    mockCoaching(null);
    renderSheet({ exercise: { ...exercise, exercise_name: "Unilateral Machine Row" } });
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Left")).toBeInTheDocument();
  });

  it("switches itself on when last session was logged per side", () => {
    mockCoaching(null);
    renderSheet({ lastSets: [sidedSet()] });
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  // Review finding: the sheet closes between exercises and iOS drops the app
  // during rest, so a choice made today must survive reopening the sheet.
  it("switches itself on when this session already has a set logged per side", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [sidedSet()] });
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("stays off for a plain exercise with a plain last session", () => {
    mockCoaching(null);
    renderSheet({ lastSets: [aSet(1)] });
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText(/reps/i)).toBeInTheDocument();
  });

  // Review focus 1: the sheet can open before last session's sets arrive.
  it("follows last session when it loads after the sheet opened, until the switch is touched", async () => {
    mockCoaching(null);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (lastSets: WorkoutSet[]) => (
      <QueryClientProvider client={qc}>
        <ExerciseSheet exercise={exercise} todaySets={[]} lastSets={lastSets}
          onClose={vi.fn()} onLogSet={vi.fn()} onDeleteSet={vi.fn()} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui([]));
    expect(toggle()).toHaveAttribute("aria-pressed", "false");

    rerender(ui([sidedSet()]));
    expect(toggle()).toHaveAttribute("aria-pressed", "true");

    // The user turns it off. Data changing afterwards must not overrule them.
    await userEvent.click(toggle());
    rerender(ui([]));
    rerender(ui([sidedSet()]));
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows both sides of a set logged that way", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [sidedSet()] });
    expect(screen.getByText("Set 1 · 100kg × L7 R8")).toBeInTheDocument();
  });
});
