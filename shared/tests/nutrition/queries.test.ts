import { describe, it, expect } from 'vitest'
import { latestActiveTarget } from '../../src/domain/nutrition/queries'
import type { NutritionTarget } from '../../src/types'

function t(partial: Partial<NutritionTarget>): NutritionTarget {
  return {
    id: partial.id ?? 'x',
    user_id: 'u',
    effective_from: partial.effective_from ?? '2026-01-01',
    goal_mode: partial.goal_mode ?? 'cut',
    calories: partial.calories ?? 2000,
    protein_g: 150,
    fat_g: 70,
    carbs_g: 200,
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
  }
}

describe('latestActiveTarget', () => {
  it('returns null for an empty list', () => {
    expect(latestActiveTarget([], '2026-05-28')).toBeNull()
  })

  it('returns null when every row is after the target date', () => {
    const rows = [t({ effective_from: '2026-06-01' })]
    expect(latestActiveTarget(rows, '2026-05-28')).toBeNull()
  })

  it('returns the row with the latest effective_from on or before the date', () => {
    const rows = [
      t({ id: 'a', effective_from: '2026-01-01' }),
      t({ id: 'b', effective_from: '2026-03-01' }),
      t({ id: 'c', effective_from: '2026-06-01' }),
    ]
    expect(latestActiveTarget(rows, '2026-05-28')?.id).toBe('b')
  })

  it('tiebreaks on created_at desc when effective_from matches', () => {
    const rows = [
      t({ id: 'old', effective_from: '2026-05-01', created_at: '2026-05-01T08:00:00Z' }),
      t({ id: 'new', effective_from: '2026-05-01', created_at: '2026-05-01T12:00:00Z' }),
    ]
    expect(latestActiveTarget(rows, '2026-05-28')?.id).toBe('new')
  })

  it('includes the row whose effective_from equals the date', () => {
    const rows = [t({ id: 'today', effective_from: '2026-05-28' })]
    expect(latestActiveTarget(rows, '2026-05-28')?.id).toBe('today')
  })
})
