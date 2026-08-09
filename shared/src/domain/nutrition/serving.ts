import type { FoodHit, FoodHitServing } from '../../types'
import type { FoodLogUnit } from '../../types'

export interface ResolvedMacros {
  kcal: number
  p: number
  f: number
  c: number
}

export function resolveMacros(
  hit: FoodHit,
  picked: FoodHitServing,
  quantity: number,
  unit: FoodLogUnit,
): ResolvedMacros {
  if (!quantity || quantity <= 0) return { kcal: 0, p: 0, f: 0, c: 0 }

  if (unit === 'serving') {
    return {
      kcal: picked.kcal * quantity,
      p:    picked.p    * quantity,
      f:    picked.f    * quantity,
      c:    picked.c    * quantity,
    }
  }

  // unit === 'g'
  if (hit.per100g) {
    return {
      kcal: hit.per100g.kcal * quantity / 100,
      p:    hit.per100g.p    * quantity / 100,
      f:    hit.per100g.f    * quantity / 100,
      c:    hit.per100g.c    * quantity / 100,
    }
  }
  if (picked.grams > 0) {
    const k = quantity / picked.grams
    return { kcal: picked.kcal * k, p: picked.p * k, f: picked.f * k, c: picked.c * k }
  }
  return { kcal: 0, p: 0, f: 0, c: 0 }
}
