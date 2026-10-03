import { describe, it, expect } from "vitest";
import { parseWorkoutSheet, type Cell, type SheetTab } from "../src/db/workoutSheetParse";

/** A tab as the workbook gives it: cells by address, everything else empty. */
const tab = (name: string, cells: Record<string, Cell>): SheetTab => ({
  name,
  cell: (address) => cells[address] ?? null,
});

// The tracker's template labels, present on every tab and never data.
const LABELS: Record<string, Cell> = {
  B2: "EXERCISE / WORKOUT TRACKER", B4: "Date:", B6: "Muscle Group:", B8: "Exercise",
  C8: "Set 1", C9: "Weight (KG)", D9: "Reps", B21: "Cardio Exercise", C21: "Distance (Miles)",
};

const session = (name: string, cells: Record<string, Cell>) => tab(name, { ...LABELS, ...cells });

describe("parseWorkoutSheet", () => {
  it("reads a session: the day, each set in order, and the cardio", () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("19062026", {
        C4: "19th June 2026", C6: "Upper",
        B10: "T Bar Row", C10: 30, D10: 9, E10: 30, F10: 8, G10: 30, H10: 8,
        B11: "Lat Pulldown", C11: 61.2, D11: 6,
        B22: "Incline Treadmill", C22: 0.17, E22: 5, G22: 3.5, I22: 15, K22: 40,
      }),
    ]);
    expect(notes).toEqual([]);
    expect(workouts).toEqual([
      {
        date: "2026-06-19",
        day_name: "Upper",
        sets: [
          { exercise_name: "T Bar Row", set_number: 1, weight_kg: 30, reps: 9, is_bodyweight: false, reps_left: null, reps_right: null },
          { exercise_name: "T Bar Row", set_number: 2, weight_kg: 30, reps: 8, is_bodyweight: false, reps_left: null, reps_right: null },
          { exercise_name: "T Bar Row", set_number: 3, weight_kg: 30, reps: 8, is_bodyweight: false, reps_left: null, reps_right: null },
          { exercise_name: "Lat Pulldown", set_number: 1, weight_kg: 61.2, reps: 6, is_bodyweight: false, reps_left: null, reps_right: null },
        ],
        cardio: [
          {
            exercise: "Incline Treadmill", distance_miles: 0.17, duration_minutes: 5,
            speed: 3.5, incline: 15, calories_burned: 40,
          },
        ],
      },
    ]);
  });

  // The date cell is free text and was copied wrongly once: tab 24072026 says
  // "27th July 2026", and the dashboard's own log confirms the 24th.
  it("takes the date from the tab name, and says when the date cell disagrees", () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("24072026", { C4: "27th July 2026", C6: "Upper", B10: "Lat Pulldown", C10: 59, D10: 7 }),
    ]);
    expect(workouts[0]!.date).toBe("2026-07-24");
    expect(notes).toEqual(['2026-07-24: the date cell says "27th July 2026"; used the tab name']);
  });

  it("ignores tabs that are not a date, and refuses one that is not a real day", () => {
    const { workouts, ignoredTabs } = parseWorkoutSheet([
      session("Tracker Template", {}),
      tab("Split", { A1: "Day", B1: "Exercise" }),
      session("01102026", { C4: "1st October 2026", C6: "Push", B10: "Pec Deck Fly", C10: 93, D10: 6 }),
    ]);
    expect(ignoredTabs).toEqual(["Tracker Template", "Split"]);
    expect(workouts.map((w) => w.date)).toEqual(["2026-10-01"]);
    expect(() => parseWorkoutSheet([session("31022026", { C6: "Push" })])).toThrow(/31022026/);
  });

  it("logs 0 kg as a bodyweight set", () => {
    const { workouts } = parseWorkoutSheet([
      session("06082026", { C6: "Pull", B10: "Pull Ups", C10: 0, D10: 5 }),
    ]);
    expect(workouts[0]!.sets[0]).toMatchObject({ weight_kg: 0, is_bodyweight: true });
  });

  it("skips an exercise with no sets, and a set with no reps, saying so", () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("04082026", {
        C6: "Push",
        B10: "V Bar Tricep Extension", C10: 26.1, D10: 8, E10: 26.1, F10: 8, G10: 26.1,
        B11: "Machine Shoulder Press",
      }),
    ]);
    expect(workouts[0]!.sets.map((s) => s.set_number)).toEqual([1, 2]);
    expect(notes).toEqual([
      "2026-08-04 V Bar Tricep Extension: set 3 has a weight (26.1) but no reps; left out",
      "2026-08-04 Machine Shoulder Press: no sets; left out",
    ]);
  });

  // Left | right on a single-sided lift (the user, 2026-10-03): both kept, the lower counts.
  it('reads "6 | 5" reps as left 6, right 5, counting 5', () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("24082026", { C6: "Pull", B10: "Unilateral Machine Preacher Curl", C10: 17.5, D10: "6 | 5" }),
    ]);
    expect(workouts[0]!.sets[0]).toMatchObject({ reps: 5, reps_left: 6, reps_right: 5 });
    expect(notes).toEqual([]);
  });

  it("refuses reps it cannot read rather than guess", () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("24082026", {
        C6: "Pull",
        B10: "Reverse Curl", C10: 10.2, D10: "lots", E10: 12.5, F10: 7.5,
        B11: "Lat Pulldown", C11: 66, D11: 7,
      }),
    ]);
    expect(workouts[0]!.sets.map((s) => s.exercise_name)).toEqual(["Lat Pulldown"]);
    expect(notes).toEqual([
      '2026-08-24 Reverse Curl: set 1 reps "lots" are not a whole number; left out',
      '2026-08-24 Reverse Curl: set 2 reps "7.5" are not a whole number; left out',
      "2026-08-24 Reverse Curl: no sets; left out",
    ]);
  });

  // The dashboard keys a set by (exercise, set number), so two rows of one
  // exercise must not both claim set 1.
  it("numbers on from the first row when an exercise has two rows", () => {
    const { workouts, notes } = parseWorkoutSheet([
      session("24082026", {
        C6: "Pull",
        B12: "Unilateral Machine Row", C12: 63, D12: 6,
        B13: "Unilateral Machine Row", C13: 36.3, D13: 7, E13: 36.3, F13: 8,
      }),
    ]);
    expect(workouts[0]!.sets.map((s) => [s.set_number, s.weight_kg])).toEqual([[1, 63], [2, 36.3], [3, 36.3]]);
    expect(notes).toEqual(["2026-08-24 Unilateral Machine Row: on two rows; numbered as one exercise, sets 1-3"]);
  });

  // The user, 2026-10-03: the 63 kg row on 24 Aug "isn't supposed to be
  // unilateral". A fix for one row of one tab, not for the name everywhere.
  it("corrects a single row's exercise name, and only that row", () => {
    const { workouts, notes } = parseWorkoutSheet(
      [
        session("24082026", {
          C6: "Pull",
          B12: "Unilateral Machine Row", C12: 63, D12: 6,
          B13: "Unilateral Machine Row", C13: 36.3, D13: 7, E13: 36.3, F13: 8,
        }),
        session("02092026", { C6: "Upper", B12: "Unilateral Machine Row", C12: 36.3, D12: 8 }),
      ],
      {},
      { "2026-08-24": { 12: "Machine Row" } },
    );
    expect(workouts.map((w) => w.sets.map((s) => `${s.exercise_name} ${s.set_number} ${s.weight_kg}`))).toEqual([
      ["Machine Row 1 63", "Unilateral Machine Row 1 36.3", "Unilateral Machine Row 2 36.3"],
      ["Unilateral Machine Row 1 36.3"],
    ]);
    expect(notes).toEqual(['2026-08-24 row 12: "Unilateral Machine Row" corrected to "Machine Row"']);
  });

  it("renames an exercise to the name the dashboard already uses", () => {
    const { workouts } = parseWorkoutSheet(
      [session("31072026", { C6: "Pull", B10: "Machine T Bar Row", C10: 40, D10: 7 })],
      { "Machine T Bar Row": "T Bar Row" },
    );
    expect(workouts[0]!.sets[0]!.exercise_name).toBe("T Bar Row");
  });

  // An empty session reads as a skipped workout in the history. Two empty Pull
  // sessions from June already do.
  it("leaves out a tab with nothing logged, saying so", () => {
    const { workouts, notes } = parseWorkoutSheet([session("18082026", { C6: "Pull", B15: "Seated SLDL" })]);
    expect(workouts).toEqual([]);
    expect(notes).toEqual(["2026-08-18 Seated SLDL: no sets; left out", "2026-08-18: nothing logged; left out"]);
  });

  it("refuses a session with no day name", () => {
    expect(() => parseWorkoutSheet([session("02082026", { B10: "Bench Press", C10: 57.5, D10: 8 })])).toThrow(
      /02082026.*day/i,
    );
  });
});
