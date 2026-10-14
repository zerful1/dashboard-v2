import { describe, it, expect } from "vitest";
import { shiftISO, type TrendFit } from "@dashboard/shared";
import { goalLine, latestText, rateLine } from "../src/features/weight/weightText";

const TODAY = "2026-10-14"; // a Wednesday
const fit = (ratePerWeek: number, current = 82): TrendFit => ({ status: "fit", ratePerWeek, current, slope: ratePerWeek / 7 });
const goal = (target_kg: number, start_kg: number | null = 84) => ({ id: "g", kind: "weight" as const, target_kg, start_kg });

describe("rateLine", () => {
  it("words a falling rate, green toward a lower goal", () => {
    expect(rateLine(fit(-0.4), goal(78))).toEqual({ kind: "rate", arrow: "▼", text: "−0.4 kg a week", tone: "good" });
  });
  it("leaves a rate away from the goal neutral, never amber or red", () => {
    expect(rateLine(fit(0.4), goal(78))).toMatchObject({ arrow: "▲", text: "+0.4 kg a week", tone: "neutral" });
  });
  // Spec §9: past a reached goal, carrying on is not progress. The goal line
  // says "reached" by the same rule (weightGoalReached), so the two agree.
  it("goes neutral once the goal is reached", () => {
    expect(rateLine(fit(-0.5, 77.9), goal(78))).toMatchObject({ kind: "rate", tone: "neutral" });
    expect(rateLine(fit(-0.5, 78.1), goal(78))).toMatchObject({ tone: "good" });
  });
  it("is neutral without a goal", () => {
    expect(rateLine(fit(-0.4), null)).toMatchObject({ tone: "neutral" });
  });
  it("calls under 0.05 kg a week flat, the projection's own threshold", () => {
    expect(rateLine(fit(-0.04), goal(78))).toEqual({ kind: "flat" });
    expect(rateLine(fit(-0.05), goal(78))).toMatchObject({ kind: "rate" });
  });
  it("says how many weigh-ins a rate still needs", () => {
    expect(rateLine({ status: "not-enough-data", have: 9, need: 14 }, goal(78))).toEqual({ kind: "none", have: 9, need: 14 });
  });
});

describe("latestText", () => {
  it("says today, yesterday, or the date", () => {
    expect(latestText(81.8, TODAY, TODAY)).toBe("latest 81.8 today");
    expect(latestText(81.8, shiftISO(TODAY, -1), TODAY)).toBe("latest 81.8 yesterday");
    expect(latestText(81.8, "2026-10-03", TODAY)).toBe("latest 81.8 on 3 Oct");
    expect(latestText(80, "2025-12-30", TODAY)).toBe("latest 80.0 on 30 Dec 2025");
  });
});

/** n daily weigh-ins ending today, on an exact line at `perWeek` that ends at `endKg`. */
const daily = (n: number, endKg: number, perWeek: number) =>
  Array.from({ length: n }, (_, i) => ({ date: shiftISO(TODAY, -(n - 1 - i)), kg: endKg - (perWeek * (n - 1 - i)) / 7 }));
describe("goalLine", () => {
  it("names the Monday the trend reaches the goal", () => {
    // From 80 at -0.5 kg a week, 79 is 14 days away: Wed 28 Oct, whose Monday is 26 Oct.
    expect(goalLine(goal(79), daily(14, 80, -0.5), TODAY)).toBe("Goal 79 kg · around 26 Oct");
  });
  it("says reached, moving away, no date, and over a year", () => {
    expect(goalLine(goal(81), daily(14, 80, -0.5), TODAY)).toBe("Goal 81 kg · reached");
    expect(goalLine(goal(78), daily(14, 80, 0.5), TODAY)).toBe("Goal 78 kg · moving away");
    expect(goalLine(goal(78), daily(14, 80, -0.01), TODAY)).toBe("Goal 78 kg · no date at this rate");
    expect(goalLine(goal(70), daily(14, 80, -0.1), TODAY)).toBe("Goal 70 kg · over a year away");
  });
  it("names only the target while there is too little to project from", () => {
    expect(goalLine(goal(78), daily(5, 80, -0.5), TODAY)).toBe("Goal 78 kg");
  });
});
