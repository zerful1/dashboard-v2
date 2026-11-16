import type { FoodHit, FoodHitServing, FoodLogUnit, LabelTotals, LabelValues } from '../../types'

const KEYS = [
  ['fibre', 'fibre_g'],
  ['sugar', 'sugar_g'],
  ['satFat', 'sat_fat_g'],
  ['salt', 'salt_g'],
] as const satisfies readonly (readonly [keyof LabelValues, keyof LabelTotals])[]

export type LabelSums = Record<keyof LabelTotals, { total: number | null; partial: boolean }>

/** Label nutrients for an amount, case for case with resolveMacros; a missing value stays null, not 0. */
export function resolveLabelNutrients(
  food: Pick<FoodHit, 'per100g'>,
  picked: FoodHitServing,
  quantity: number,
  unit: FoodLogUnit,
): LabelTotals {
  const out: LabelTotals = { fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null }
  if (!quantity || quantity <= 0) return out

  for (const [src, dst] of KEYS) {
    const servingValue = picked[src]
    if (unit === 'serving') {
      out[dst] = servingValue == null ? null : servingValue * quantity
      continue
    }
    const per100 = food.per100g?.[src]
    if (per100 != null) out[dst] = (per100 * quantity) / 100
    else if (picked.grams > 0 && servingValue != null) out[dst] = (servingValue * quantity) / picked.grams
    else out[dst] = null
  }
  return out
}

/** A day's totals; `partial` marks a total that only some entries contributed to. */
export function sumLabelNutrients(entries: LabelTotals[]): LabelSums {
  const sums = {} as LabelSums
  for (const [, key] of KEYS) {
    let total: number | null = null
    let missing = 0
    for (const e of entries) {
      const v = e[key]
      if (v == null) missing++
      else total = (total ?? 0) + v
    }
    sums[key] = { total, partial: total !== null && missing > 0 }
  }
  return sums
}
