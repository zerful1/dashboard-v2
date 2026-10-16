import { describe, it, expect } from "vitest";
import type { Goal, NutritionTarget, SplitConfig } from "@dashboard/shared";
import { goalsText, habitsText, splitText, targetText } from "../src/features/settings/shortcutText";

const split = (week: SplitConfig["week"]): SplitConfig => ({ days: [{ day_type: 1, label: "Push" }], week });
const goal = (over: Partial<Goal>): Goal => ({
  id: "g", user_id: "u", kind: "weight", exercise_name: null, target_kg: 78, start_kg: 80, created_at: "", ...over,
});

describe("splitText", () => {
  it("counts the training days and names the rest days", () => {
    expect(splitText(split([1, 2, "rest", 3, 4, 5, "rest"]))).toBe("5 days, rest Wed · Sun");
    expect(splitText(split([1, 2, 3, 4, 5, 6, "rest"]))).toBe("6 days, rest Sun");
  });
  it("says only the count with no rest day", () => {
    expect(splitText(split([1, 2, 3, 4, 5, 6, 7]))).toBe("7 days");
  });
});

describe("targetText", () => {
  it("gives calories and protein", () => {
    expect(targetText({ calories: 2402, protein_g: 180 } as NutritionTarget)).toBe("2,402 kcal · 180 g protein");
  });
  it("says Not set without one", () => {
    expect(targetText(null)).toBe("Not set");
  });
});

describe("goalsText", () => {
  it("gives the weight goal and counts the lifts", () => {
    expect(goalsText([goal({}), goal({ id: "l", kind: "lift", exercise_name: "Squat", target_kg: 140 })])).toBe("78 kg · 1 lift");
    expect(goalsText([goal({ kind: "lift", exercise_name: "A" }), goal({ id: "b", kind: "lift", exercise_name: "B" })])).toBe("2 lifts");
  });
  it("says Not set without any", () => {
    expect(goalsText([])).toBe("Not set");
  });
});

describe("habitsText", () => {
  it("counts them", () => {
    expect(habitsText(0)).toBe("No habits");
    expect(habitsText(1)).toBe("1 habit");
    expect(habitsText(2)).toBe("2 habits");
  });
});
