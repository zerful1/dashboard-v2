import { describe, it, expect } from 'vitest'
import { mifflinStJeor, trendWeightChange, tdeeFromLog } from '../../src/domain/nutrition/tdeeInputs'
import { shiftISO } from '../../src/domain/date'

const START = '2026-09-01'
const day = (n: number) => shiftISO(START, n)

describe('mifflinStJeor', () => {
  it('matches a hand calculation', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780, x 1.55 = 2759
    expect(mifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'moderate' })).toBe(2759)
  })

  it('applies the female constant', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25, x 1.2 = 1584.3
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, age: 30, sex: 'female', activity: 'sedentary' })).toBe(1584)
  })
})

describe('trendWeightChange', () => {
  it('is null with fewer than seven weigh-ins', () => {
    const six = [0, 1, 2, 3, 4, 5].map((n) => ({ date: day(n), weight_kg: 80 }))
    expect(trendWeightChange(six, START, 28)).toBeNull()
  })

  // The weight chart fits over POSITION (deriveWeight.ts). This must fit over
  // DAYS, or a gap between weigh-ins distorts the slope.
  it('fits kg per day, not per weigh-in, across a gap', () => {
    // Six daily weigh-ins losing 0.1 kg/day, then one three weeks later on the same line.
    const ws = [0, 1, 2, 3, 4, 5, 26].map((n) => ({ date: day(n), weight_kg: 80 - 0.1 * n }))
    expect(trendWeightChange(ws, START, 28)).toBeCloseTo(-2.8)
  })
})

describe('tdeeFromLog', () => {
  const flat = Array.from({ length: 28 }, (_, n) => ({ date: day(n), weight_kg: 80 }))

  // The trap the spec names: averageDailyIntake divides by EVERY day. Swapped
  // in here it gives 1000 and this test fails.
  it('divides intake by days with food, not by the window', () => {
    const entries = Array.from({ length: 14 }, (_, k) => ({ date: day(k * 2), calories: 2000 }))
    expect(tdeeFromLog({ entries, weights: flat, windowStart: START, windowEnd: day(27) }))
      .toEqual({ kcal: 2000, daysLogged: 14, weighIns: 28 })
  })

  it('adds back the deficit a falling trend implies', () => {
    // 0.05 kg/day x 28 = 1.4 kg; 1.4 x 7700 / 28 = 385 kcal/day
    const falling = Array.from({ length: 28 }, (_, n) => ({ date: day(n), weight_kg: 80 - 0.05 * n }))
    const entries = Array.from({ length: 28 }, (_, n) => ({ date: day(n), calories: 2000 }))
    expect(tdeeFromLog({ entries, weights: falling, windowStart: START, windowEnd: day(27) })!.kcal).toBe(2385)
  })

  it('is null under fourteen logged days', () => {
    const entries = Array.from({ length: 13 }, (_, n) => ({ date: day(n), calories: 2000 }))
    expect(tdeeFromLog({ entries, weights: flat, windowStart: START, windowEnd: day(27) })).toBeNull()
  })

  it('is null under seven weigh-ins', () => {
    const entries = Array.from({ length: 28 }, (_, n) => ({ date: day(n), calories: 2000 }))
    expect(tdeeFromLog({ entries, weights: flat.slice(0, 6), windowStart: START, windowEnd: day(27) })).toBeNull()
  })

  it('ignores entries and weigh-ins outside the window', () => {
    const entries = [
      ...Array.from({ length: 14 }, (_, k) => ({ date: day(k * 2), calories: 2000 })),
      { date: shiftISO(START, -1), calories: 9000 },
      { date: day(28), calories: 9000 },
    ]
    expect(tdeeFromLog({ entries, weights: flat, windowStart: START, windowEnd: day(27) })!.kcal).toBe(2000)
  })
})
