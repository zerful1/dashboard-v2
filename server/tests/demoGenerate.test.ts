import { describe, it, expect } from "vitest";
import { recordEvents, shiftISO } from "@dashboard/shared";
import { generateDemo, DEMO_WEEKS } from "../src/demo/generate";

const TODAY = "2026-10-04";
const d = generateDemo(TODAY);
const dateOf = new Map(d.sessions.map((s) => [s.key, s.date]));
// Windows that start on the same weekday draw the same numbers, so the
// generator makes seven distinct people: one for each weekday "today" can be.
const WEEK = Array.from({ length: 7 }, (_, i) => shiftISO(TODAY, i));

describe("generateDemo", () => {
  it("ends yesterday and leaves today empty", () => {
    for (const today of WEEK) {
      const g = generateDemo(today);
      const dates = g.sessions.map((s) => s.date).sort();
      expect(dates.at(-1)! <= shiftISO(today, -1)).toBe(true);
      expect(g.sessions.some((s) => s.date === today)).toBe(false);
      expect(g.food.some((f) => f.date === today)).toBe(false);
      expect(dates[0]! >= shiftISO(today, -7 * DEMO_WEEKS)).toBe(true);
    }
  });

  // Review focus 2: the staleness check reads the newest weigh-in.
  it("always weighs in yesterday", () => {
    for (const today of WEEK) {
      expect(generateDemo(today).weights.at(-1)!.date).toBe(shiftISO(today, -1));
    }
  });

  it("gives Insights enough to project and to show records", () => {
    const since56 = shiftISO(TODAY, -56);
    expect(d.weights.filter((w) => w.date > since56).length).toBeGreaterThanOrEqual(14);
    const since84 = shiftISO(TODAY, -84);
    for (const lift of ["Bench Press", "Lat Pulldown"]) {
      const days = new Set(d.sets.filter((s) => s.exercise_name === lift).map((s) => dateOf.get(s.session)!));
      expect([...days].filter((x) => x > since84).length).toBeGreaterThanOrEqual(6);
    }
    const rows = d.sets.map((s) => ({ ...s, date: dateOf.get(s.session)! }));
    expect(recordEvents(rows).length).toBeGreaterThan(0);
    expect(d.goals.map((g) => [g.kind, g.exercise_name])).toEqual([
      ["weight", null], ["lift", "Bench Press"], ["lift", "Lat Pulldown"],
    ]);
  });

  it("writes only rows the database would accept", () => {
    for (const s of d.sets) {
      expect(s.reps).toBeGreaterThan(0);
      if (s.is_bodyweight) expect(s.weight_kg).toBe(0);
      if (s.reps_left !== null || s.reps_right !== null) {
        expect(s.reps).toBe(Math.min(s.reps_left!, s.reps_right!));
      }
    }
    expect(d.sets.some((s) => s.reps_left !== null)).toBe(true);
    expect(new Set(d.weights.map((w) => w.date)).size).toBe(d.weights.length);
    expect(new Set(d.sessions.map((s) => s.date)).size).toBe(d.sessions.length);
  });

  it("logs food on each of the last 21 days, near the cut target", () => {
    const days = [...new Set(d.food.map((f) => f.date))].sort();
    expect(days).toHaveLength(21);
    expect(days.at(-1)).toBe(shiftISO(TODAY, -1));
    const avg = d.food.reduce((n, f) => n + f.calories, 0) / 21;
    expect(avg).toBeGreaterThan(1800);
    expect(avg).toBeLessThan(2400);
  });

  it("is the same person every time, shifted to the day", () => {
    expect(generateDemo(TODAY)).toEqual(d);
    const later = generateDemo("2026-10-11");
    expect(later.weights.at(-1)!.date).toBe("2026-10-10");
  });

  // Review focus 4. These are the generator's figures for TODAY before habits
  // existed. Habits draw from their own random stream; drawing one from the
  // shared stream would move every value after it, and with them these.
  it("leaves the rest of the demo exactly as it was", () => {
    expect({
      sessions: d.sessions.length, sets: d.sets.length, weights: d.weights.length, food: d.food.length,
      cardio: d.cardio.length, firstKg: d.weights[0]!.weight_kg, lastKg: d.weights.at(-1)!.weight_kg,
      goals: d.goals.map((g) => g.target_kg),
    }).toEqual({ sessions: 76, sets: 1140, weights: 96, food: 200, cardio: 12, firstKg: 83.8, lastKg: 79.8, goals: [78, 87.5, 80] });
  });

  it("keeps two daily habits, mostly done, always done yesterday, never today", () => {
    for (const today of WEEK) {
      const g = generateDemo(today);
      expect(g.habits.map((h) => h.name)).toEqual(["Stretch 10 min", "Read 20 pages"]);
      for (const habit of [0, 1]) {
        const days = g.habitDays.filter((x) => x.habit === habit).map((x) => x.date);
        expect(days).toContain(shiftISO(today, -1));
        expect(days.every((x) => x >= shiftISO(today, -21) && x < today)).toBe(true);
        expect(days.length).toBeGreaterThanOrEqual(12);
        expect(days.length).toBeLessThanOrEqual(20);
      }
    }
  });
});
