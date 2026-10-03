import { describe, it, expect } from "vitest";
import { deriveDay } from "../src/features/nutrition/deriveDay";
import type { FoodLogEntry, NutritionTarget } from "@dashboard/shared";

const target = (effective_from: string, calories = 2402): NutritionTarget => ({
  id: effective_from, user_id: "u", effective_from, goal_mode: "cut",
  calories, protein_g: 180, fat_g: 93, carbs_g: 210, created_at: `${effective_from}T00:00:00Z`,
});
const entry = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  id: "e", user_id: "u", date: "2026-09-23", logged_at: "", food_item_id: null, name: "x",
  quantity: 1, unit: "serving", calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, ...over,
});

describe("deriveDay", () => {
  it("uses the target in force on that day, not a later one", () => {
    const d = deriveDay([], [target("2026-09-24", 2000), target("2026-06-09")], "2026-09-23");
    expect(d.target?.calories).toBe(2402);
  });

  it("reports kcal left, negative when over", () => {
    expect(deriveDay([entry({ calories: 1640 })], [target("2026-06-09")], "2026-09-23").left).toBe(762);
    expect(deriveDay([entry({ calories: 2500 })], [target("2026-06-09")], "2026-09-23").left).toBe(-98);
  });

  it("flags carbs and fat over target, and never protein", () => {
    const d = deriveDay([entry({ protein_g: 200, carbs_g: 230, fat_g: 50 })], [target("2026-06-09")], "2026-09-23");
    const over = Object.fromEntries(d.bars.map((b) => [b.key, b.over]));
    expect(over).toEqual({ protein: false, carbs: true, fat: false });
  });

  it("does not flag a fraction of a gram over", () => {
    const d = deriveDay([entry({ carbs_g: 210.3 })], [target("2026-06-09")], "2026-09-23");
    expect(d.bars.find((b) => b.key === "carbs")!.over).toBe(false);
  });

  it("has no bars and no kcal left without a target", () => {
    const d = deriveDay([entry({ calories: 500 })], [], "2026-09-23");
    expect(d).toMatchObject({ kcal: 500, target: null, left: null, bars: [] });
  });
});
