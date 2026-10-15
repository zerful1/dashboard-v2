import { describe, it, expect } from "vitest";
import type { RecordEvent } from "@dashboard/shared";
import { orderRecords, recordLine, recordsIn } from "../src/features/insights/recordLine";

const ev = (date: string, exercise_name: string, over: Partial<RecordEvent>): RecordEvent => ({ date, exercise_name, ...over });

describe("recordLine", () => {
  it("chooses the heaviest weight over the 1RM and the reps", () => {
    expect(recordLine(ev("2026-09-24", "Leg Press", {
      heaviest: { weightKg: 210, reps: 6, previousKg: 200 }, e1rm: { valueKg: 280, previousKg: 266.5 }, reps: { reps: 12, previous: 10 },
    }))).toEqual({ value: "210 kg", change: "+10", percent: 0.05 });
  });

  it("falls back to the estimated 1RM, then to the reps", () => {
    expect(recordLine(ev("2026-09-24", "Leg Curl", { e1rm: { valueKg: 70, previousKg: 66.5 } }))).toMatchObject({ value: "est. 70 kg", change: "+3.5" });
    expect(recordLine(ev("2026-09-24", "Pull Ups", { reps: { reps: 12, previous: 10 } }))).toMatchObject({ value: "12 reps", change: "+2" });
  });

  it("rounds the change to one decimal, without a trailing .0", () => {
    expect(recordLine(ev("2026-09-24", "Row", { heaviest: { weightKg: 72.5, reps: 8, previousKg: 70.2 } })).change).toBe("+2.3");
    expect(recordLine(ev("2026-09-24", "Row", { heaviest: { weightKg: 80, reps: 8, previousKg: 70 } })).change).toBe("+10");
  });
});

describe("orderRecords", () => {
  it("puts the biggest jump first, by percentage, so kilograms and reps compare", () => {
    const bench = ev("2026-09-24", "Bench", { heaviest: { weightKg: 62.5, reps: 5, previousKg: 60 } }); // 4.2%
    const squat = ev("2026-09-22", "Squat", { heaviest: { weightKg: 105, reps: 5, previousKg: 100 } }); // 5%
    const pullUps = ev("2026-09-23", "Pull Ups", { reps: { reps: 11, previous: 10 } }); // 10%
    expect(orderRecords([bench, squat, pullUps]).map((e) => e.exercise_name)).toEqual(["Pull Ups", "Squat", "Bench"]);
  });

  it("breaks a tie with the newest first", () => {
    const older = ev("2026-09-22", "A", { heaviest: { weightKg: 105, reps: 5, previousKg: 100 } });
    const newer = ev("2026-09-25", "B", { heaviest: { weightKg: 105, reps: 5, previousKg: 100 } });
    expect(orderRecords([older, newer]).map((e) => e.exercise_name)).toEqual(["B", "A"]);
  });

  // Review focus 2.
  it("sorts a record from zero first, without dividing by zero", () => {
    const fromZero = ev("2026-09-22", "Dip", { heaviest: { weightKg: 10, reps: 8, previousKg: 0 } });
    const big = ev("2026-09-23", "Squat", { heaviest: { weightKg: 150, reps: 5, previousKg: 100 } });
    expect(orderRecords([big, fromZero]).map((e) => e.exercise_name)).toEqual(["Dip", "Squat"]);
    expect(recordLine(fromZero).change).toBe("+10");
  });
});

describe("recordsIn", () => {
  it("keeps the records dated inside the range, both ends included", () => {
    const events = ["2026-09-20", "2026-09-21", "2026-09-27", "2026-09-28"].map((d) => ev(d, d, { reps: { reps: 2, previous: 1 } }));
    expect(recordsIn(events, "2026-09-21", "2026-09-27").map((e) => e.date)).toEqual(["2026-09-21", "2026-09-27"]);
  });
});
