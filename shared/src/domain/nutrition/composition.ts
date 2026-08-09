import { toLocalISO } from '../date'
import type { BodyWeightEntry, NutritionTarget } from '../../types'

export interface CompositionResult {
  headline: string
  color: 'green' | 'amber' | 'red'
  muscleFraction: number | null
  fatFraction: number | null
  weeklyVolume: number
  windowLabel: 'Last 30 days'
  avgDailyKcal: number | null
}

export interface WorkoutWindowData {
  sessions: { id: string; date: string }[]
  sets: { session_id: string; exercise_name: string; weight_kg: number; reps: number; is_bodyweight: boolean }[]
}

export function computeComposition(
  weightEntries: BodyWeightEntry[],
  workout: WorkoutWindowData | undefined,
  nutrition: { avgDailyKcal: number | null; daysWithData: number },
  activeTarget: NutritionTarget | null,
): CompositionResult | null {
  if (!workout) return null

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - 30)

  const windowMid = new Date(now)
  windowMid.setDate(windowMid.getDate() - 15)

  const windowStartStr = toLocalISO(windowStart)
  const windowMidStr   = toLocalISO(windowMid)

  const windowEntries = weightEntries.filter(e => e.date >= windowStartStr)
  if (windowEntries.length < 14) return null

  const { sessions, sets } = workout
  if (sessions.length < 2) return null

  const earliest    = windowEntries[0]!
  const latest      = windowEntries[windowEntries.length - 1]!
  const weightDelta = parseFloat((latest.weight_kg - earliest.weight_kg).toFixed(2))

  const weightedSets = sets.filter(s => !s.is_bodyweight)

  const sessionDateMap = new Map(sessions.map(s => [s.id, s.date]))

  type TaggedSet = { exercise_name: string; weight_kg: number; reps: number; date: string }
  const taggedSets: TaggedSet[] = weightedSets
    .map(s => ({ ...s, date: sessionDateMap.get(s.session_id) ?? '' }))
    .filter(s => s.date !== '' && s.reps >= 1)

  const exerciseNames = [...new Set(taggedSets.map(s => s.exercise_name))]
  const epley = (s: TaggedSet) => s.weight_kg * (1 + s.reps / 30)
  const ratios: number[] = []

  for (const name of exerciseNames) {
    const exSets     = taggedSets.filter(s => s.exercise_name === name)
    const firstHalf  = exSets.filter(s => s.date < windowMidStr)
    const secondHalf = exSets.filter(s => s.date >= windowMidStr)
    if (firstHalf.length === 0 || secondHalf.length === 0) continue
    ratios.push(Math.max(...secondHalf.map(epley)) / Math.max(...firstHalf.map(epley)))
  }

  const strengthDelta = ratios.length > 0
    ? ratios.reduce((a, b) => a + b, 0) / ratios.length
    : 1.0

  const weeklyVolume = Math.round(
    weightedSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0) / (30 / 7)
  )

  let headline: string
  let color: 'green' | 'amber' | 'red'
  let muscleFraction: number | null = null
  let fatFraction: number | null    = null

  if (weightDelta > 0.5) {
    if (strengthDelta > 1.05) {
      headline = 'Gaining mostly muscle'
      color    = 'green'
    } else {
      headline = 'Likely gaining fat — push lifts harder or tighten calories'
      color    = 'amber'
    }
    const maxMuscle = 0.45 * 4.3
    const muscleKg = Math.min(weightDelta, maxMuscle)
    muscleFraction = muscleKg / weightDelta
    fatFraction    = 1 - muscleFraction
  } else if (weightDelta < -0.5) {
    headline = strengthDelta >= 0.95
      ? 'Losing fat, muscle preserved'
      : 'May be losing muscle — consider a slight calorie increase'
    color = strengthDelta >= 0.95 ? 'green' : 'red'
  } else {
    // Flat-weight catch-all.
    //
    // Design principles (spec Section 7):
    //   1. "Honesty over flattery in interpretive copy."
    //      Deficit and surplus branches must surface TDEE-miscalibration as the
    //      most parsimonious explanation, symmetrically.
    //   2. "Green should be earned, not inferred."
    //      Both new branches are amber — a 200-kcal apparent surplus is one
    //      self-reported signal with wide error bars.
    //
    const hasNutrition = nutrition.avgDailyKcal !== null && nutrition.daysWithData >= 14
    if (hasNutrition && activeTarget) {
      const surplus = nutrition.avgDailyKcal! - activeTarget.calories
      if (surplus > 200) {
        headline = 'Stable weight, eating in a surplus — TDEE may be higher than target'
        color    = 'amber'
      } else if (surplus < -200) {
        headline = 'Stable weight, eating in a deficit — TDEE may be lower than target'
        color    = 'amber'
      } else {
        headline = 'Weight stable at maintenance intake'
        color    = 'amber'
      }
    } else {
      headline = 'Weight stable'
      color    = 'amber'
    }
  }

  const hasNutrition = nutrition.avgDailyKcal !== null && nutrition.daysWithData >= 14
  return {
    headline, color, muscleFraction, fatFraction,
    weeklyVolume, windowLabel: 'Last 30 days',
    avgDailyKcal: hasNutrition ? nutrition.avgDailyKcal : null,
  }
}

// Test-only alias — production code goes through the hook.
export const computeCompositionForTest = computeComposition
