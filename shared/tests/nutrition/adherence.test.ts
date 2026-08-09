import { describe, it, expect } from 'vitest'
import { averageDailyIntake, distinctLoggedDates } from '../../src/domain/nutrition/adherence'

describe('averageDailyIntake', () => {
  it('returns 0 over an empty window', () => {
    expect(averageDailyIntake([], 7)).toBe(0)
  })

  it('averages total kcal across the window (denominator = days, not days-with-data)', () => {
    // 3 entries summing to 6000 kcal across a 7-day window → 6000/7 ≈ 857
    const entries = [
      { date: '2026-05-22', calories: 2000 },
      { date: '2026-05-23', calories: 2500 },
      { date: '2026-05-24', calories: 1500 },
    ]
    expect(averageDailyIntake(entries, 7)).toBe(857)
  })
})

describe('distinctLoggedDates', () => {
  it('returns unique date strings from a flat list of entries', () => {
    const entries = [
      { date: '2026-05-22' }, { date: '2026-05-22' }, { date: '2026-05-23' },
    ]
    expect(distinctLoggedDates(entries)).toEqual(['2026-05-22', '2026-05-23'])
  })
})
