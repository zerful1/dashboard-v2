import { describe, it, expect } from 'vitest'
import { dedupRecents } from '../../src/domain/nutrition/dedup'
import type { FoodLogEntry } from '../../src/types'

function e(partial: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: partial.id ?? 'x',
    user_id: 'u',
    date: partial.date ?? '2026-05-28',
    logged_at: partial.logged_at ?? '2026-05-28T08:00:00Z',
    food_item_id: partial.food_item_id ?? null,
    name: partial.name ?? 'item',
    quantity: 1,
    unit: 'serving',
    calories: 100,
    protein_g: 10,
    fat_g: 1,
    carbs_g: 10,
  }
}

describe('dedupRecents', () => {
  it('returns an empty array for empty input', () => {
    expect(dedupRecents([], 20)).toEqual([])
  })

  it('dedups by food_item_id when set', () => {
    const rows = [
      e({ id: 'a', food_item_id: 'food-1', logged_at: '2026-05-28T10:00:00Z' }),
      e({ id: 'b', food_item_id: 'food-1', logged_at: '2026-05-28T09:00:00Z' }),
      e({ id: 'c', food_item_id: 'food-2', logged_at: '2026-05-28T08:00:00Z' }),
    ]
    const result = dedupRecents(rows, 20)
    expect(result.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('dedups by lower(name) when food_item_id is null', () => {
    const rows = [
      e({ id: 'a', food_item_id: null, name: 'Apple', logged_at: '2026-05-28T10:00:00Z' }),
      e({ id: 'b', food_item_id: null, name: 'apple', logged_at: '2026-05-28T09:00:00Z' }),
      e({ id: 'c', food_item_id: null, name: 'Banana', logged_at: '2026-05-28T08:00:00Z' }),
    ]
    const result = dedupRecents(rows, 20)
    expect(result.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('treats a null food_item_id and the same name from a real food as distinct', () => {
    const rows = [
      e({ id: 'a', food_item_id: 'food-x', name: 'X' }),
      e({ id: 'b', food_item_id: null,     name: 'food-x' }),
    ]
    const result = dedupRecents(rows, 20)
    expect(result.map(r => r.id)).toEqual(['a', 'b'])
  })

  it('respects the limit', () => {
    const rows = [
      e({ id: 'a', food_item_id: 'f1' }),
      e({ id: 'b', food_item_id: 'f2' }),
      e({ id: 'c', food_item_id: 'f3' }),
    ]
    expect(dedupRecents(rows, 2).map(r => r.id)).toEqual(['a', 'b'])
  })
})
