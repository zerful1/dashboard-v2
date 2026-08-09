import { describe, it, expect } from 'vitest'
import { computeCompositionForTest } from '../../src/domain/nutrition/composition'
import type { BodyWeightEntry, NutritionTarget } from '../../src/types'

function weight(date: string, kg: number): BodyWeightEntry {
  return { id: date, user_id: 'u', date, weight_kg: kg, notes: null, created_at: date }
}

function fortyDays(): BodyWeightEntry[] {
  const out: BodyWeightEntry[] = []
  const start = new Date()
  for (let i = 30; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86_400_000)
    const iso = d.toISOString().slice(0, 10)
    out.push(weight(iso, 80))
  }
  return out
}

const target: NutritionTarget = {
  id: 't', user_id: 'u', effective_from: '2026-01-01', goal_mode: 'cut',
  calories: 2400, protein_g: 180, fat_g: 90, carbs_g: 210, created_at: '2026-01-01',
}

describe('computeComposition flat-band refinement', () => {
  it('returns "Weight stable" without nutrition data (existing behaviour preserved)', () => {
    const r = computeCompositionForTest(
      fortyDays(),
      { sessions: [{ id: 's1', date: '2026-05-01' }, { id: 's2', date: '2026-05-20' }], sets: [] },
      { avgDailyKcal: null, daysWithData: 0 },
      null,
    )
    expect(r?.headline).toBe('Weight stable')
    expect(r?.color).toBe('amber')
    expect(r?.avgDailyKcal).toBeNull()
  })

  it('returns the surplus message in amber when intake >200 over target', () => {
    const r = computeCompositionForTest(
      fortyDays(),
      { sessions: [{ id: 's1', date: '2026-05-01' }, { id: 's2', date: '2026-05-20' }], sets: [] },
      { avgDailyKcal: 2700, daysWithData: 20 },
      target,
    )
    expect(r?.headline).toContain('TDEE may be higher than target')
    expect(r?.color).toBe('amber')
    expect(r?.avgDailyKcal).toBe(2700)
  })

  it('returns the deficit message in amber when intake <200 under target', () => {
    const r = computeCompositionForTest(
      fortyDays(),
      { sessions: [{ id: 's1', date: '2026-05-01' }, { id: 's2', date: '2026-05-20' }], sets: [] },
      { avgDailyKcal: 2100, daysWithData: 20 },
      target,
    )
    expect(r?.headline).toContain('TDEE may be lower than target')
    expect(r?.color).toBe('amber')
  })

  it('returns "maintenance intake" within ±200 of target', () => {
    const r = computeCompositionForTest(
      fortyDays(),
      { sessions: [{ id: 's1', date: '2026-05-01' }, { id: 's2', date: '2026-05-20' }], sets: [] },
      { avgDailyKcal: 2350, daysWithData: 20 },
      target,
    )
    expect(r?.headline).toBe('Weight stable at maintenance intake')
    expect(r?.color).toBe('amber')
  })

  it('falls through to existing behaviour when nutrition daysWithData < 14', () => {
    const r = computeCompositionForTest(
      fortyDays(),
      { sessions: [{ id: 's1', date: '2026-05-01' }, { id: 's2', date: '2026-05-20' }], sets: [] },
      { avgDailyKcal: 2700, daysWithData: 10 },
      target,
    )
    expect(r?.headline).toBe('Weight stable')
    expect(r?.avgDailyKcal).toBeNull()
  })
})
