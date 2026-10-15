import { describe, it, expect } from 'vitest'
import { reviewDays, weekNumbers, weeklyReview, type ReviewInputs } from '../src/domain/insights/review'
import { DEFAULT_SPLIT } from '../src/domain/splitRotation'
import type { NutritionTarget } from '../src/types'

// 2026-09-21 is a Monday; its week runs to Sunday 2026-09-27.
const empty: ReviewInputs = { sessionDates: [], sets: [], food: [], weights: [] }
const set = (date: string, weight_kg: number, reps: number, is_bodyweight = false) =>
  ({ date, weight_kg, reps, is_bodyweight })
const target = (effective_from: string, calories: number, protein_g: number): NutritionTarget => ({
  id: effective_from, user_id: 'u', effective_from, goal_mode: 'cut', calories, protein_g, fat_g: 70, carbs_g: 200,
  created_at: `${effective_from}T00:00:00Z`,
})

describe('weekNumbers', () => {
  it('counts training days, sets and volume, leaving bodyweight sets out of volume', () => {
    const n = weekNumbers({
      ...empty,
      sessionDates: ['2026-09-22', '2026-09-24', '2026-09-24', '2026-09-28'],
      sets: [set('2026-09-22', 60, 5), set('2026-09-24', 62.5, 4), set('2026-09-24', 0, 10, true), set('2026-09-28', 70, 5)],
    }, '2026-09-21')
    expect(n.training).toEqual({ days: 2, sets: 3, volume: 550 })
  })

  it('reads a week with no food as not logged, never as zero', () => {
    expect(weekNumbers(empty, '2026-09-21').food).toEqual({ daysLogged: 0, avgKcal: null, avgProteinG: null })
  })

  it('averages food over the days logged, not over seven', () => {
    const n = weekNumbers({
      ...empty,
      food: [
        { date: '2026-09-22', calories: 1000, protein_g: 80 },
        { date: '2026-09-22', calories: 1400, protein_g: 100 },
        { date: '2026-09-25', calories: 2000, protein_g: 160 },
      ],
    }, '2026-09-21')
    expect(n.food).toEqual({ daysLogged: 2, avgKcal: 2200, avgProteinG: 170 })
  })

  it('averages the weigh-ins inside the week only', () => {
    const n = weekNumbers({
      ...empty,
      weights: [{ date: '2026-09-20', weight_kg: 90 }, { date: '2026-09-22', weight_kg: 78 }, { date: '2026-09-27', weight_kg: 77 }],
    }, '2026-09-21')
    expect(n.weight).toEqual({ average: 77.5, weighIns: 2 })
    expect(weekNumbers(empty, '2026-09-21').weight).toEqual({ average: null, weighIns: 0 })
  })
})

describe('weeklyReview', () => {
  it('pairs the week with the one before it, across a month end', () => {
    const r = weeklyReview({ ...empty, sessionDates: ['2026-09-23', '2026-09-30', '2026-10-02'] }, '2026-09-28', DEFAULT_SPLIT, [])
    expect(r.week).toBe('2026-09-28')
    expect(r.current.training.days).toBe(2)
    expect(r.previous.training.days).toBe(1)
  })

  it('takes the training target from the split and the food target in force on the Sunday', () => {
    const r = weeklyReview(empty, '2026-09-21', DEFAULT_SPLIT, [target('2026-06-09', 2402, 180), target('2026-09-25', 2600, 190)])
    expect(r.trainingTarget).toBe(5)
    expect(r.foodTarget).toEqual({ calories: 2600, proteinG: 190 })
    expect(weeklyReview(empty, '2026-09-21', DEFAULT_SPLIT, []).foodTarget).toBeNull()
  })
})

describe('reviewDays', () => {
  const inputs: ReviewInputs = {
    ...empty,
    sessionDates: ['2026-09-21', '2026-09-23', '2026-09-28'],
    food: [
      { date: '2026-09-22', calories: 1000, protein_g: 80 },
      { date: '2026-09-22', calories: 1400, protein_g: 100 },
      { date: '2026-09-20', calories: 9999, protein_g: 1 },
    ],
    weights: [
      { date: '2026-09-21', weight_kg: 80.4 },
      { date: '2026-09-27', weight_kg: 79.9 },
      { date: '2026-09-28', weight_kg: 70 },
    ],
  }

  it('gives the seven days from the Monday, each with its training, calories and weigh-in', () => {
    expect(reviewDays(inputs, '2026-09-21')).toEqual([
      { date: '2026-09-21', trained: true, kcal: null, weightKg: 80.4 },
      { date: '2026-09-22', trained: false, kcal: 2400, weightKg: null },
      { date: '2026-09-23', trained: true, kcal: null, weightKg: null },
      { date: '2026-09-24', trained: false, kcal: null, weightKg: null },
      { date: '2026-09-25', trained: false, kcal: null, weightKg: null },
      { date: '2026-09-26', trained: false, kcal: null, weightKg: null },
      { date: '2026-09-27', trained: false, kcal: null, weightKg: 79.9 },
    ])
  })

  it('is what the weekly review returns as its days', () => {
    expect(weeklyReview(inputs, '2026-09-21', DEFAULT_SPLIT, []).days).toEqual(reviewDays(inputs, '2026-09-21'))
  })
})
