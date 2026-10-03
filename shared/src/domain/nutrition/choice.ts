import type {
  DiaryEntryInput, FoodHit, FoodHitServing, FoodInput, FoodItem, FoodLogEntry, FoodLogUnit, FoodNutrition,
} from '../../types'
import { resolveMacros } from './serving'
import { resolveLabelNutrients } from './labels'

export type ChoiceLink =
  | { kind: 'item'; foodItemId: string }
  | { kind: 'store'; food: FoodInput }
  | { kind: 'none' }

/** Everything the amount step needs, whichever tab the food came from. Always has at least one serving. */
export interface FoodChoice {
  name: string
  brand: string | null
  servings: FoodHitServing[]
  per100g: FoodHit['per100g']
  link: ChoiceLink
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r2n = (n: number | null) => (n === null ? null : r2(n))

/** A search hit. Logging it stores it in the library, so it is one tap from Recent next time. */
export function hitToChoice(hit: FoodHit): FoodChoice {
  // Text-search hits carry only "100 g"; a barcode product also has its label serving.
  const serving = hit.servings.find((s) => s.label !== '100 g') ?? null
  const p = hit.per100g
  const food: FoodInput = {
    source: hit.source,
    external_id: hit.externalId,
    name: hit.name,
    brand: hit.brand ?? null,
    serving_description: serving?.label ?? null,
    serving_grams: serving?.grams ?? null,
    kcal_per_serving: serving?.kcal ?? null,
    protein_per_serving: serving?.p ?? null,
    fat_per_serving: serving?.f ?? null,
    carbs_per_serving: serving?.c ?? null,
    kcal_per_100g: p?.kcal ?? null,
    protein_per_100g: p?.p ?? null,
    fat_per_100g: p?.f ?? null,
    carbs_per_100g: p?.c ?? null,
    fibre_per_100g: p?.fibre ?? null,
    sugar_per_100g: p?.sugar ?? null,
    sat_fat_per_100g: p?.satFat ?? null,
    salt_per_100g: p?.salt ?? null,
    fibre_per_serving: serving?.fibre ?? null,
    sugar_per_serving: serving?.sugar ?? null,
    sat_fat_per_serving: serving?.satFat ?? null,
    salt_per_serving: serving?.salt ?? null,
  }
  return { name: hit.name, brand: hit.brand ?? null, servings: hit.servings, per100g: hit.per100g, link: { kind: 'store', food } }
}

function fromNutrition(n: FoodNutrition, name: string, brand: string | null, link: ChoiceLink): FoodChoice {
  const servings: FoodHitServing[] = []
  if (n.kcal_per_serving !== null) {
    servings.push({
      label: n.serving_description ?? '1 serving',
      grams: n.serving_grams ?? 0,
      kcal: n.kcal_per_serving,
      p: n.protein_per_serving ?? 0,
      f: n.fat_per_serving ?? 0,
      c: n.carbs_per_serving ?? 0,
      fibre: n.fibre_per_serving,
      sugar: n.sugar_per_serving,
      satFat: n.sat_fat_per_serving,
      salt: n.salt_per_serving,
    })
  }
  const per100g =
    n.kcal_per_100g === null
      ? null
      : {
          kcal: n.kcal_per_100g,
          p: n.protein_per_100g ?? 0,
          f: n.fat_per_100g ?? 0,
          c: n.carbs_per_100g ?? 0,
          fibre: n.fibre_per_100g,
          sugar: n.sugar_per_100g,
          satFat: n.sat_fat_per_100g,
          salt: n.salt_per_100g,
        }
  if (per100g) servings.push({ label: '100 g', grams: 100, ...per100g })
  return { name, brand, servings, per100g, link }
}

/** A food in the user's library, picked from Recent. */
export function itemToChoice(item: FoodItem): FoodChoice {
  return fromNutrition(item, item.name, item.brand, { kind: 'item', foodItemId: item.id })
}

/** A food typed in on the Custom tab. Logging it stores it as 'manual'. */
export function customToChoice(food: FoodInput): FoodChoice {
  return fromNutrition(food, food.name, food.brand, { kind: 'store', food })
}

/**
 * A recent entry with no library item behind it: a migrated v1 row, or a food
 * since deleted. Its snapshot is linear in quantity, so the per-unit values are
 * the snapshot divided by the quantity - in the unit it was logged in, and only
 * that one.
 */
export function entryToChoice(entry: FoodLogEntry): FoodChoice {
  const k = entry.unit === 'g' ? 100 / entry.quantity : 1 / entry.quantity
  const scale = (v: number | null) => (v === null ? null : v * k)
  const values = {
    kcal: entry.calories * k,
    p: entry.protein_g * k,
    f: entry.fat_g * k,
    c: entry.carbs_g * k,
    fibre: scale(entry.fibre_g),
    sugar: scale(entry.sugar_g),
    satFat: scale(entry.sat_fat_g),
    salt: scale(entry.salt_g),
  }
  return entry.unit === 'g'
    ? { name: entry.name, brand: null, servings: [{ label: '100 g', grams: 100, ...values }], per100g: values, link: { kind: 'none' } }
    : { name: entry.name, brand: null, servings: [{ label: '1 serving', grams: 0, ...values }], per100g: null, link: { kind: 'none' } }
}

/** The POST body for logging `quantity` `unit`s of `picked` on `date`. */
export function buildEntryInput(
  choice: FoodChoice,
  picked: FoodHitServing,
  quantity: number,
  unit: FoodLogUnit,
  date: string,
): DiaryEntryInput {
  const m = resolveMacros(choice, picked, quantity, unit)
  const l = resolveLabelNutrients(choice, picked, quantity, unit)
  return {
    date,
    name: choice.name,
    quantity,
    unit,
    calories: r2(m.kcal),
    protein_g: r2(m.p),
    fat_g: r2(m.f),
    carbs_g: r2(m.c),
    fibre_g: r2n(l.fibre_g),
    sugar_g: r2n(l.sugar_g),
    sat_fat_g: r2n(l.sat_fat_g),
    salt_g: r2n(l.salt_g),
    ...(choice.link.kind === 'item' ? { food_item_id: choice.link.foodItemId } : {}),
    ...(choice.link.kind === 'store' ? { food: choice.link.food } : {}),
  }
}
