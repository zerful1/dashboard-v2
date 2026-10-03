import { describe, it, expect } from 'vitest'
import {
  hitToChoice, itemToChoice, customToChoice, entryToChoice, buildEntryInput,
} from '../../src/domain/nutrition/choice'
import type { FoodHit, FoodInput, FoodItem, FoodLogEntry } from '../../src/types'

const per100g = { kcal: 380, p: 13, f: 7, c: 65, fibre: 9, sugar: null, satFat: 1.2, salt: 0.02 }
const oatsHit: FoodHit = {
  source: 'cofid', externalId: '11-800', name: 'Oats',
  servings: [{ label: '100 g', grams: 100, ...per100g }], per100g,
}

const NUTRITION_NULLS = {
  serving_description: null, serving_grams: null,
  kcal_per_serving: null, protein_per_serving: null, fat_per_serving: null, carbs_per_serving: null,
  kcal_per_100g: null, protein_per_100g: null, fat_per_100g: null, carbs_per_100g: null,
  fibre_per_100g: null, sugar_per_100g: null, sat_fat_per_100g: null, salt_per_100g: null,
  fibre_per_serving: null, sugar_per_serving: null, sat_fat_per_serving: null, salt_per_serving: null,
}

describe('hitToChoice', () => {
  it('stores a text hit as per-100 g only, keeping its labels', () => {
    const c = hitToChoice(oatsHit)
    expect(c.link.kind).toBe('store')
    if (c.link.kind !== 'store') return
    expect(c.link.food).toMatchObject({
      source: 'cofid', external_id: '11-800', kcal_per_100g: 380, fibre_per_100g: 9,
      sugar_per_100g: null, kcal_per_serving: null, serving_description: null,
    })
  })

  it("takes the serving fields from a labelled serving when there is one", () => {
    const withServing: FoodHit = {
      ...oatsHit, source: 'off', externalId: '5000',
      servings: [{ label: '1 bar (40 g)', grams: 40, kcal: 152, p: 5.2, f: 2.8, c: 26, fibre: 3.6 }, ...oatsHit.servings],
    }
    const c = hitToChoice(withServing)
    if (c.link.kind !== 'store') throw new Error('expected store')
    expect(c.link.food).toMatchObject({
      serving_description: '1 bar (40 g)', serving_grams: 40, kcal_per_serving: 152, fibre_per_serving: 3.6,
    })
  })
})

describe('itemToChoice', () => {
  it('offers a per-serving-only item as servings with no per-100 g', () => {
    const wrap = {
      id: 'i1', user_id: 'u', name: 'Chicken wrap', brand: null, is_favourite: false,
      external_source: 'manual', external_id: null, barcode: null, created_at: '',
      ...NUTRITION_NULLS, serving_description: '1 wrap', kcal_per_serving: 610,
      protein_per_serving: 38, fat_per_serving: 20, carbs_per_serving: 64,
    } satisfies FoodItem
    const c = itemToChoice(wrap)
    expect(c.per100g).toBeNull()
    expect(c.servings).toEqual([expect.objectContaining({ label: '1 wrap', grams: 0, kcal: 610 })])
    expect(c.link).toEqual({ kind: 'item', foodItemId: 'i1' })
  })
})

describe('customToChoice', () => {
  it('stores what was typed, as manual', () => {
    const food: FoodInput = {
      ...NUTRITION_NULLS, source: 'manual', external_id: null, name: 'Flapjack', brand: null,
      kcal_per_100g: 450, protein_per_100g: 6, fat_per_100g: 20, carbs_per_100g: 60,
    }
    const c = customToChoice(food)
    expect(c.link).toEqual({ kind: 'store', food })
    expect(c.per100g?.kcal).toBe(450)
  })
})

describe('entryToChoice', () => {
  const entry = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
    id: 'e', user_id: 'u', date: '2026-06-10', logged_at: '', food_item_id: null,
    name: 'Porridge', quantity: 80, unit: 'g', calories: 304, protein_g: 10.4, fat_g: 5.6, carbs_g: 52,
    fibre_g: 7.2, sugar_g: null, sat_fat_g: null, salt_g: null, ...over,
  })

  it('recovers per-100 g from an entry logged in grams', () => {
    const c = entryToChoice(entry({}))
    expect(c.per100g?.kcal).toBeCloseTo(380)
    expect(c.per100g?.fibre).toBeCloseTo(9)
    expect(c.per100g?.sugar).toBeNull()
    expect(c.link).toEqual({ kind: 'none' })
  })

  it('recovers one serving from an entry logged in servings', () => {
    const c = entryToChoice(entry({ unit: 'serving', quantity: 2, calories: 1220 }))
    expect(c.per100g).toBeNull()
    expect(c.servings[0]).toMatchObject({ label: '1 serving', grams: 0, kcal: 610 })
  })
})

describe('buildEntryInput', () => {
  it('snapshots rounded macros and labels for the chosen amount and date', () => {
    const input = buildEntryInput(hitToChoice(oatsHit), oatsHit.servings[0]!, 80, 'g', '2026-09-20')
    expect(input).toMatchObject({
      date: '2026-09-20', name: 'Oats', quantity: 80, unit: 'g',
      calories: 304, protein_g: 10.4, fat_g: 5.6, carbs_g: 52, fibre_g: 7.2, sugar_g: null,
    })
    expect(input.food?.external_id).toBe('11-800')
    expect(input.food_item_id).toBeUndefined()
  })

  it('links a library item by id and sends no food', () => {
    const c = { ...hitToChoice(oatsHit), link: { kind: 'item' as const, foodItemId: 'i9' } }
    const input = buildEntryInput(c, oatsHit.servings[0]!, 50, 'g', '2026-09-20')
    expect(input.food_item_id).toBe('i9')
    expect(input.food).toBeUndefined()
  })
})
