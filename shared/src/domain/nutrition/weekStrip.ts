import { shiftISO } from '../date'
import { latestActiveTarget } from './queries'
import type { DayTotal, NutritionTarget } from '../../types'

/** One day on Food's 7-day strip. */
export interface StripDay {
  date: string
  /** Rounded, like the day's own figure. Null: nothing logged, never 0. */
  kcal: number | null
  protein: number | null
  /** The target in force that day. */
  target: { calories: number; protein_g: number } | null
  /** Strictly over that day's target calories. Under is never flagged. */
  over: boolean
  proteinHit: boolean
  /** Today: still being eaten. */
  inProgress: boolean
}

export interface WeekStrip {
  /** The 7 days ending on `end`, oldest first. */
  days: StripDay[]
  /** Days over target; null when no day has a target. */
  over: number | null
  /** Mean kcal over the days with something logged, today left out. Null with none. */
  avg: number | null
}

/** The 7 days ending on `end`, oldest first. */
export function stripDates(end: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftISO(end, i - 6))
}

export function weekStrip(totals: DayTotal[], targets: NutritionTarget[], end: string, today: string): WeekStrip {
  const byDate = new Map(totals.map((t) => [t.date, t]))
  const days = stripDates(end).map((date): StripDay => {
    const t = byDate.get(date)
    const active = latestActiveTarget(targets, date)
    const target = active ? { calories: active.calories, protein_g: active.protein_g } : null
    const kcal = t ? Math.round(t.calories) : null
    const protein = t ? Math.round(t.protein_g) : null
    return {
      date,
      kcal,
      protein,
      target,
      over: kcal !== null && target !== null && kcal > target.calories,
      proteinHit: protein !== null && target !== null && protein >= target.protein_g,
      inProgress: date === today,
    }
  })
  // Insights' weekly review divides by days logged too, so the two agree.
  const complete = days.filter((d) => d.kcal !== null && !d.inProgress)
  return {
    days,
    over: days.some((d) => d.target !== null) ? days.filter((d) => d.over).length : null,
    avg: complete.length ? Math.round(complete.reduce((s, d) => s + d.kcal!, 0) / complete.length) : null,
  }
}
