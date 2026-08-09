import { describe, it, expect } from 'vitest'
import { estimateTDEE } from '../../src/domain/nutrition/tdee'

describe('estimateTDEE', () => {
  it('returns null when fewer than 14 days of food data', () => {
    expect(estimateTDEE({ avgDailyIntake: 2000, weightChangeKg: 0, days: 30, daysWithFood: 13 })).toBeNull()
  })

  it('returns null when window is < 14 days regardless of food days', () => {
    expect(estimateTDEE({ avgDailyIntake: 2000, weightChangeKg: 0, days: 7, daysWithFood: 7 })).toBeNull()
  })

  it('computes TDEE = intake - (deltaKg * 7700)/days when stable', () => {
    // No weight change, 30 days, intake = 2200 → TDEE = 2200
    const r = estimateTDEE({ avgDailyIntake: 2200, weightChangeKg: 0, days: 30, daysWithFood: 30 })
    expect(r).toBe(2200)
  })

  it('gives a lower TDEE when weight rose (intake exceeded TDEE)', () => {
    // +1 kg over 30 days at 2500 kcal/day → TDEE = 2500 - (1*7700)/30 ≈ 2243
    const r = estimateTDEE({ avgDailyIntake: 2500, weightChangeKg: 1, days: 30, daysWithFood: 30 })
    expect(r).toBe(2243)
  })

  it('gives a higher TDEE when weight fell (intake under TDEE)', () => {
    // -0.5 kg over 30 days at 2000 kcal/day → TDEE = 2000 + (0.5*7700)/30 ≈ 2128
    const r = estimateTDEE({ avgDailyIntake: 2000, weightChangeKg: -0.5, days: 30, daysWithFood: 30 })
    expect(r).toBe(2128)
  })
})
