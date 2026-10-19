import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExerciseSheet } from "../src/features/gym/ExerciseSheet";
import type { Exercise, LastTime, WorkoutSet } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const exercise: Exercise = { id: "e1", user_id: "u1", day_type: 1, exercise_name: "Squat", sort_order: 1 };
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
const lastTime = (sets: WorkoutSet[]): LastTime => ({ date: "2026-10-02", sets });

/** Mocks by path, not by call order: the house rule, though only coaching is fetched. */
function mockCoaching(result: unknown) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/workouts/coaching")) return result;
    throw new Error(`unexpected ${path}`);
  });
}

type Props = Parameters<typeof ExerciseSheet>[0];

/** `update` re-renders with new props, as the page does when data arrives. */
function renderSheet(props: Partial<Props> = {}) {
  const onLogSet = vi.fn();
  const onDeleteSet = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (over: Partial<Props> = {}) => (
    <QueryClientProvider client={qc}>
      <ExerciseSheet exercise={exercise} todaySets={[]} last={null} onClose={vi.fn()}
        onLogSet={onLogSet} onDeleteSet={onDeleteSet} {...props} {...over} />
    </QueryClientProvider>
  );
  const { rerender } = render(ui());
  return { onLogSet, onDeleteSet, update: (over: Partial<Props>) => rerender(ui(over)) };
}

/** A table row, found by its row header ("Set 2"). */
const row = (n: number) => within(screen.getByRole("rowheader", { name: `Set ${n}` }).closest("tr")!);
const weight = () => screen.getByLabelText(/weight/i);
const reps = () => screen.getByLabelText(/reps/i);
const sidesToggle = () => screen.getByRole("button", { name: /left \/ right/i });

afterEach(() => vi.restoreAllMocks());

describe("ExerciseSheet, logging", () => {
  it("logs a weighted set with the next set number", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet({ todaySets: [aSet(1), aSet(2)] });
    expect(weight()).toHaveValue(100);
    await userEvent.clear(weight());
    await userEvent.type(weight(), "105");
    await userEvent.type(reps(), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 3/i }));
    expect(onLogSet).toHaveBeenCalledWith(105, 5, false, 3);
  });

  it("continues numbering from the highest existing set, not the count", async () => {
    // Set 2 was deleted; the next must be 4, or it collides with set 3 on
    // UNIQUE (session_id, exercise_name, set_number), and the server upserts.
    mockCoaching(null);
    const { onLogSet } = renderSheet({ todaySets: [aSet(1), aSet(3)] });
    await userEvent.type(reps(), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 4/i }));
    expect(onLogSet).toHaveBeenCalledWith(100, 5, false, 4);
  });

  it("disables weight and logs 0 for a bodyweight set", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /mark as bodyweight/i }));
    expect(weight()).toBeDisabled();
    await userEvent.type(reps(), "9");
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
    await userEvent.type(weight(), "100");
    expect(screen.getByRole("button", { name: /add set 1/i })).toBeDisabled();
    await userEvent.type(reps(), "5");
    expect(screen.getByRole("button", { name: /add set 1/i })).toBeEnabled();
  });

  it("keeps the weight and clears the reps after logging, ready for the next set", async () => {
    mockCoaching(null);
    renderSheet();
    await userEvent.type(weight(), "100");
    await userEvent.type(reps(), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 1/i }));
    expect(weight()).toHaveValue(100);
    expect(reps()).toHaveValue(null);
    // So a stray tap cannot log the same set twice.
    expect(screen.getByRole("button", { name: /add set/i })).toBeDisabled();
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
});

describe("ExerciseSheet, last time (redesign part 3a, §3)", () => {
  it("lines today's sets up against last time's, set by set", () => {
    mockCoaching(null);
    renderSheet({
      todaySets: [aSet(1, { weight_kg: 82.5, reps: 8 }), aSet(2, { weight_kg: 82.5, reps: 7 })],
      last: lastTime([
        aSet(1, { weight_kg: 80, reps: 8 }),
        aSet(2, { weight_kg: 80, reps: 8 }),
        aSet(3, { weight_kg: 80, reps: 7 }),
        aSet(4, { weight_kg: 80, reps: 6 }),
      ]),
    });
    expect(screen.getByRole("columnheader", { name: /^Last/ })).toBeInTheDocument();
    expect(row(1).getByText("80 × 8")).toBeInTheDocument();
    expect(row(1).getByText("82.5 × 8")).toBeInTheDocument();
    expect(row(1).getByRole("button", { name: "Delete set 1" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Set 3" })).getByText("80 × 7")).toBeInTheDocument();
    expect(row(4).getByText("80 × 6")).toBeInTheDocument();
    expect(row(4).getByText("—")).toBeInTheDocument();
  });

  // Review focus 2.
  it("shows a deleted set as a gap, with no delete, and continues from the highest", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [aSet(1), aSet(3)], last: lastTime([aSet(1), aSet(2), aSet(3)]) });
    expect(row(2).getByText("100 × 5")).toBeInTheDocument();
    expect(row(2).getByText("—")).toBeInTheDocument();
    expect(row(2).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.getByRole("group", { name: "Set 4" })).toHaveTextContent("No set 4 last time");
  });

  it("deletes a set from its row", async () => {
    mockCoaching(null);
    const { onDeleteSet } = renderSheet({ todaySets: [aSet(1)] });
    await userEvent.click(row(1).getByRole("button", { name: "Delete set 1" }));
    expect(onDeleteSet).toHaveBeenCalledWith("s1");
  });

  // Housekeeping item 22, review focus 3: the reps come back only to the sheet
  // they were typed in.
  it("refills the reps when Add set fails, for that exercise only", async () => {
    mockCoaching(null);
    const { update } = renderSheet();
    await userEvent.type(weight(), "100");
    await userEvent.type(reps(), "5");
    await userEvent.click(screen.getByRole("button", { name: /add set 1/i }));
    expect(reps()).toHaveValue(null);
    update({ failedSet: { exercise_name: "Bench Press", reps: 5 } });
    expect(reps()).toHaveValue(null);
    update({ failedSet: { exercise_name: "Squat", reps: 5 } });
    expect(reps()).toHaveValue(5);
  });

  it("refills both sides when a set logged per side fails", async () => {
    mockCoaching(null);
    const { update } = renderSheet();
    await userEvent.click(sidesToggle());
    update({ failedSet: { exercise_name: "Squat", reps: { left: 7, right: 8 } } });
    expect(screen.getByLabelText("Left")).toHaveValue(7);
    expect(screen.getByLabelText("Right")).toHaveValue(8);
  });

  // Housekeeping item 23: "nothing last time" is not "First time" while today's
  // sets may still hold this exercise.
  it("says nothing about a first time while today's sets load", () => {
    mockCoaching(null);
    const { update } = renderSheet({ todayPending: true });
    expect(screen.queryByText(/First time/)).toBeNull();
    update({ todayPending: false });
    expect(screen.getByText("First time on this one. Nothing to compare yet.")).toBeInTheDocument();
  });

  it("shows only the set-1 block the first time", () => {
    mockCoaching(null);
    renderSheet();
    expect(screen.getByText("First time on this one. Nothing to compare yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("group", { name: "Set 1" })).toHaveTextContent("No last time");
  });

  it("leaves the Last column out when there is no last time", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [aSet(1)] });
    expect(screen.getByRole("columnheader", { name: "Today" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^Last/ })).toBeNull();
    expect(screen.queryByText(/First time/)).toBeNull();
  });

  it("starts from the previous set's weight, with last time's reps as the hint", () => {
    mockCoaching(null);
    renderSheet({
      todaySets: [aSet(1, { weight_kg: 82.5, reps: 8 })],
      last: lastTime([aSet(1, { weight_kg: 80, reps: 8 }), aSet(2, { weight_kg: 80, reps: 7 })]),
    });
    expect(weight()).toHaveValue(82.5);
    expect(reps()).toHaveValue(null);
    expect(reps()).toHaveAttribute("placeholder", "7");
  });

  it("hints last time's weight and reps before the first set", () => {
    mockCoaching(null);
    renderSheet({ last: lastTime([aSet(1, { weight_kg: 80, reps: 8 })]) });
    expect(weight()).toHaveValue(null);
    expect(weight()).toHaveAttribute("placeholder", "80");
    expect(reps()).toHaveAttribute("placeholder", "8");
  });

  it("starts with bodyweight on after a bodyweight set today", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [aSet(1, { is_bodyweight: true, weight_kg: 0, reps: 10 })] });
    expect(screen.getByRole("button", { name: /bodyweight: on/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows last time's bodyweight when it loads late, until the switch is touched", async () => {
    mockCoaching(null);
    const bw = lastTime([aSet(1, { is_bodyweight: true, weight_kg: 0, reps: 10 })]);
    const { update } = renderSheet();
    expect(screen.getByRole("button", { name: /mark as bodyweight/i })).toHaveAttribute("aria-pressed", "false");
    update({ last: bw });
    expect(screen.getByRole("button", { name: /bodyweight: on/i })).toHaveAttribute("aria-pressed", "true");
    // The user turns it off. Data changing afterwards must not overrule them.
    await userEvent.click(screen.getByRole("button", { name: /bodyweight: on/i }));
    update({ last: null });
    update({ last: bw });
    expect(screen.getByRole("button", { name: /mark as bodyweight/i })).toHaveAttribute("aria-pressed", "false");
  });

  // Review focus 1.
  it("keeps what you typed when last time arrives after the sheet opened", async () => {
    mockCoaching(null);
    const { update } = renderSheet();
    await userEvent.type(weight(), "90");
    await userEvent.type(reps(), "6");
    update({ last: lastTime([aSet(1, { weight_kg: 80, reps: 8 })]) });
    expect(weight()).toHaveValue(90);
    expect(reps()).toHaveValue(6);
  });

  // Final review, important 1: until last time has loaded, the sheet must not
  // claim there is none, and its arrival must not rebuild the inputs.
  it("says nothing about last time while it loads", () => {
    mockCoaching(null);
    const { update } = renderSheet({ lastPending: true });
    expect(screen.queryByText(/First time/)).toBeNull();
    expect(screen.getByRole("group", { name: "Set 1" })).not.toHaveTextContent(/last time/i);
    // The positive complement: once loaded and empty, it says so.
    update({ lastPending: false });
    expect(screen.getByText("First time on this one. Nothing to compare yet.")).toBeInTheDocument();
  });

  it("keeps the inputs, and the focus, when last time arrives", async () => {
    mockCoaching(null);
    const { update } = renderSheet({ lastPending: true });
    const input = weight();
    await userEvent.type(input, "90");
    expect(input).toHaveFocus();
    update({ lastPending: false, last: lastTime([aSet(1, { weight_kg: 80, reps: 8 })]) });
    expect(weight()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue(90);
  });

  it("keeps a typed weight when a bodyweight last time arrives late", async () => {
    mockCoaching(null);
    const { update } = renderSheet({ lastPending: true });
    await userEvent.type(weight(), "90");
    update({ lastPending: false, last: lastTime([aSet(1, { is_bodyweight: true, weight_kg: 0, reps: 10 })]) });
    expect(screen.getByRole("button", { name: /mark as bodyweight/i })).toHaveAttribute("aria-pressed", "false");
    expect(weight()).toBeEnabled();
    expect(weight()).toHaveValue(90);
  });

  it("keeps the set being logged in view, on open and after each Add set", () => {
    mockCoaching(null);
    // jsdom has no scrollIntoView, so the sheet must call it optionally.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      const { update } = renderSheet({ last: lastTime([aSet(1), aSet(2)]) });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.contexts[0]).toBe(screen.getByRole("group", { name: "Set 1" }));
      update({ todaySets: [aSet(1)] });
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll.mock.contexts[1]).toBe(screen.getByRole("group", { name: "Set 2" }));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

// Deferred from #32: opened before today's sets arrived, the sheet numbered the
// next set 1, and the server's upsert then overwrote the real set 1.
describe("ExerciseSheet, before today's sets load", () => {
  it("won't log a set, or number it, until today's sets are in", async () => {
    mockCoaching(null);
    const { onLogSet, update } = renderSheet({ todayPending: true });
    await userEvent.type(weight(), "90");
    await userEvent.type(reps(), "6{Enter}");
    expect(onLogSet).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Next set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add set" })).toBeDisabled();
    // The positive complement: once they are, it logs after the real set 1.
    update({ todayPending: false, todaySets: [aSet(1)] });
    await userEvent.click(screen.getByRole("button", { name: "Add set 2" }));
    expect(onLogSet).toHaveBeenCalledWith(90, 6, false, 2);
  });

  // Final review: following today's sets past their arrival moved the weight
  // when a set was deleted to redo it, and the redo logged the wrong one.
  it("keeps the weight when a set is deleted to redo it", () => {
    mockCoaching(null);
    const sets = [aSet(1, { weight_kg: 80 }), aSet(2, { weight_kg: 80 }), aSet(3, { weight_kg: 85 })];
    const { update } = renderSheet({ todaySets: sets });
    expect(weight()).toHaveValue(85);
    update({ todaySets: sets.slice(0, 2) });
    expect(weight()).toHaveValue(85);
  });

  it("fills the weight in from today's sets when they arrive after opening", () => {
    mockCoaching(null);
    const { update } = renderSheet({ todayPending: true });
    expect(weight()).toHaveValue(null);
    update({ todayPending: false, todaySets: [aSet(1, { weight_kg: 82.5 })] });
    expect(weight()).toHaveValue(82.5);
  });
});

describe("ExerciseSheet, left / right", () => {
  const sidedSet = (over: Partial<WorkoutSet> = {}) => aSet(1, { reps: 7, reps_left: 7, reps_right: 8, ...over });

  it("logs both sides when Left / right is on, and needs both", async () => {
    mockCoaching(null);
    const { onLogSet } = renderSheet();
    await userEvent.click(sidesToggle());
    await userEvent.type(weight(), "20");
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
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Left")).toBeInTheDocument();
  });

  it("switches itself on when last time was logged per side, and hints each side", () => {
    mockCoaching(null);
    renderSheet({ last: lastTime([sidedSet()]) });
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Left")).toHaveAttribute("placeholder", "7");
    expect(screen.getByLabelText("Right")).toHaveAttribute("placeholder", "8");
  });

  // Review finding: the sheet closes between exercises and iOS drops the app
  // during rest, so a choice made today must survive reopening the sheet.
  it("switches itself on when this session already has a set logged per side", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [sidedSet()] });
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("stays off for a plain exercise with a plain last time", () => {
    mockCoaching(null);
    renderSheet({ last: lastTime([aSet(1)]) });
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "false");
    expect(reps()).toBeInTheDocument();
  });

  it("follows last time when it loads after the sheet opened, until the switch is touched", async () => {
    mockCoaching(null);
    const { update } = renderSheet();
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "false");
    update({ last: lastTime([sidedSet()]) });
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(sidesToggle());
    update({ last: null });
    update({ last: lastTime([sidedSet()]) });
    expect(sidesToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows both sides of a set logged that way", () => {
    mockCoaching(null);
    renderSheet({ todaySets: [sidedSet()] });
    expect(row(1).getByText("100 × L7 R8")).toBeInTheDocument();
  });
});
