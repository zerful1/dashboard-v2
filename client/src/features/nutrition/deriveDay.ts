import { latestActiveTarget, sumLabelNutrients, type LabelSums } from "@dashboard/shared";
import type { FoodLogEntry, NutritionTarget } from "@dashboard/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  eaten: number;
  target: number;
  /** Over target, for a macro where over matters. Protein never is. */
  over: boolean;
}

export interface DaySummary {
  kcal: number;
  target: NutritionTarget | null;
  /** kcal left; negative when over. Null without a target. */
  left: number | null;
  bars: MacroBar[];
  labels: LabelSums;
}

/** Everything the day's card and strip show, in one pure pass. `date` is asserted by the caller. */
export function deriveDay(entries: FoodLogEntry[], targets: NutritionTarget[], date: string): DaySummary {
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    Math.round(entries.reduce((s, e) => s + e[k], 0));
  const kcal = sum("calories");
  const target = latestActiveTarget(targets, date);
  const protein = sum("protein_g");
  const carbs = sum("carbs_g");
  const fat = sum("fat_g");

  // Compared after rounding, so 0.3 g over does not turn a bar gold.
  const bars: MacroBar[] = target
    ? [
        { key: "protein", label: "Protein", eaten: protein, target: target.protein_g, over: false },
        { key: "carbs", label: "Carbs", eaten: carbs, target: target.carbs_g, over: carbs > target.carbs_g },
        { key: "fat", label: "Fat", eaten: fat, target: target.fat_g, over: fat > target.fat_g },
      ]
    : [];

  return {
    kcal,
    target,
    left: target ? target.calories - kcal : null,
    bars,
    labels: sumLabelNutrients(entries),
  };
}
