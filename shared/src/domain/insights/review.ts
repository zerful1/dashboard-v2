import type { NutritionTarget } from '../../types'
import { shiftISO } from '../date'
import { latestActiveTarget } from '../nutrition/queries'
import type { SplitConfig } from '../splitRotation'

/** The rows a review reads, for a span covering the week and the one before it. */
export interface ReviewInputs {
  sessionDates: string[]
  sets: { date: string; weight_kg: number; reps: number; is_bodyweight: boolean }[]
  food: { date: string; calories: number; protein_g: number }[]
  weights: { date: string; weight_kg: number }[]
}

export interface WeekNumbers {
  training: { days: number; sets: number; volume: number }
  food: { daysLogged: number; avgKcal: number | null; avgProteinG: number | null }
  weight: { average: number | null; weighIns: number }
}

/** One day of the reviewed week (redesign part 6, §3.1). */
export interface ReviewDay {
  date: string
  /** A session that day: the rule `training.days` counts. */
  trained: boolean
  /** The day's summed calories; null when nothing was logged, never 0. */
  kcal: number | null
  /** The day's weigh-in; null when none. */
  weightKg: number | null
}

export interface WeeklyReview {
  /** The week's Monday. */
  week: string
  current: WeekNumbers
  previous: WeekNumbers
  /** Monday to Sunday of `week`: the strips beside each row. */
  days: ReviewDay[]
  /** Non-rest slots in the split. */
  trainingTarget: number
  /** In force on the week's Sunday; null when there was none. */
  foodTarget: { calories: number; proteinG: number } | null
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** One Monday-to-Sunday week out of rows that may span more. */
export function weekNumbers(inputs: ReviewInputs, monday: string): WeekNumbers {
  const sunday = shiftISO(monday, 6)
  const inside = (date: string) => date >= monday && date <= sunday
  const sets = inputs.sets.filter((s) => inside(s.date))
  const food = inputs.food.filter((f) => inside(f.date))
  const weights = inputs.weights.filter((w) => inside(w.date))
  const foodDays = new Set(food.map((f) => f.date)).size
  return {
    training: {
      days: new Set(inputs.sessionDates.filter(inside)).size,
      sets: sets.length,
      // A bodyweight set's stored weight is 0, so it has no volume to add. On a
      // single-sided set `reps` is the weaker side, as in every other stat.
      volume: sum(sets.filter((s) => !s.is_bodyweight).map((s) => s.weight_kg * s.reps)),
    },
    food: {
      daysLogged: foodDays,
      // Over the days logged, and null rather than 0 when there were none: an
      // empty week is "nothing logged", not "ate nothing".
      avgKcal: foodDays ? sum(food.map((f) => f.calories)) / foodDays : null,
      avgProteinG: foodDays ? sum(food.map((f) => f.protein_g)) / foodDays : null,
    },
    weight: {
      average: weights.length ? sum(weights.map((w) => w.weight_kg)) / weights.length : null,
      weighIns: weights.length,
    },
  }
}

/** The seven days from `monday`, out of rows that may span more (§3.1). */
export function reviewDays(inputs: ReviewInputs, monday: string): ReviewDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftISO(monday, i)
    const food = inputs.food.filter((f) => f.date === date)
    const weight = inputs.weights.find((w) => w.date === date)
    return {
      date,
      trained: inputs.sessionDates.includes(date),
      kcal: food.length ? sum(food.map((f) => f.calories)) : null,
      weightKg: weight ? weight.weight_kg : null,
    }
  })
}

export function weeklyReview(
  inputs: ReviewInputs,
  monday: string,
  split: SplitConfig,
  targets: NutritionTarget[],
): WeeklyReview {
  const target = latestActiveTarget(targets, shiftISO(monday, 6))
  return {
    week: monday,
    current: weekNumbers(inputs, monday),
    previous: weekNumbers(inputs, shiftISO(monday, -7)),
    days: reviewDays(inputs, monday),
    trainingTarget: split.week.filter((slot) => slot !== 'rest').length,
    foodTarget: target ? { calories: target.calories, proteinG: target.protein_g } : null,
  }
}
