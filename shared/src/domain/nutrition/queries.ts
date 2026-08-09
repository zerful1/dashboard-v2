import type { NutritionTarget, GoalMode } from '../../types'

export function latestActiveTarget(
  rows: NutritionTarget[],
  on: string,
): NutritionTarget | null {
  return rows
    .filter(r => r.effective_from <= on)
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from) ||
      b.created_at.localeCompare(a.created_at))[0] ?? null
}

export function latestForMode(
  rows: NutritionTarget[],
  mode: GoalMode,
): NutritionTarget | null {
  return rows
    .filter(r => r.goal_mode === mode)
    .sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from) ||
      b.created_at.localeCompare(a.created_at))[0] ?? null
}
