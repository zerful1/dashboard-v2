import type { NutritionTarget } from '../../types'

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
