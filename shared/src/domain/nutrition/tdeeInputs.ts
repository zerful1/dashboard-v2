import type { ActivityLevel, Sex } from '../../types'
import { linearTrend } from '../trend'
import { daysBetweenISO } from '../date'
import { distinctLoggedDates } from './adherence'
import { estimateTDEE } from './tdee'

export const TDEE_WINDOW_DAYS = 28
export const MIN_WEIGH_INS = 7

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
}

/** Maintenance kcal from Mifflin-St Jeor BMR x activity. A population formula: a starting point only. */
export function mifflinStJeor(i: {
  weightKg: number
  heightCm: number
  age: number
  sex: Sex
  activity: ActivityLevel
}): number {
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + (i.sex === 'male' ? 5 : -161)
  return Math.round(bmr * ACTIVITY_FACTORS[i.activity])
}

/** Kg change from a least-squares fit over DAYS (not position), so a one-day water swing barely moves it. */
export function trendWeightChange(
  weights: { date: string; weight_kg: number }[],
  windowStart: string,
  windowDays: number,
): number | null {
  if (weights.length < MIN_WEIGH_INS) return null
  const { slope } = linearTrend(
    weights.map((w) => ({ x: daysBetweenISO(windowStart, w.date), y: w.weight_kg })),
  )
  return slope * windowDays
}

/** The your-data TDEE estimate over [windowStart, windowEnd]: total kcal / DAYS WITH FOOD. */
export function tdeeFromLog(i: {
  entries: { date: string; calories: number }[]
  weights: { date: string; weight_kg: number }[]
  windowStart: string
  windowEnd: string
}): { kcal: number; daysLogged: number; weighIns: number } | null {
  const inWindow = (d: string) => d >= i.windowStart && d <= i.windowEnd
  const entries = i.entries.filter((e) => inWindow(e.date))
  const weights = i.weights.filter((w) => inWindow(w.date))

  const daysLogged = distinctLoggedDates(entries).length
  if (daysLogged === 0) return null

  const days = daysBetweenISO(i.windowStart, i.windowEnd) + 1
  const change = trendWeightChange(weights, i.windowStart, days)
  if (change === null) return null

  const total = entries.reduce((s, e) => s + Number(e.calories), 0)
  const kcal = estimateTDEE({
    avgDailyIntake: total / daysLogged,
    weightChangeKg: change,
    days,
    daysWithFood: daysLogged,
  })
  return kcal === null ? null : { kcal, daysLogged, weighIns: weights.length }
}

/** The range an adaptive estimate must fall in to be shown. */
export const ADAPTIVE_TDEE_MIN = 1200
export const ADAPTIVE_TDEE_MAX = 5000
/** How far from the formula estimate it may stray, when there is one. */
export const ADAPTIVE_TDEE_MAX_DRIFT = 0.3

/** Whether an adaptive estimate is believable; out of range or far from the formula, show the formula. */
export function plausibleAdaptive(kcal: number, formulaKcal: number | null): boolean {
  if (kcal < ADAPTIVE_TDEE_MIN || kcal > ADAPTIVE_TDEE_MAX) return false
  return formulaKcal === null || Math.abs(kcal - formulaKcal) <= formulaKcal * ADAPTIVE_TDEE_MAX_DRIFT
}
