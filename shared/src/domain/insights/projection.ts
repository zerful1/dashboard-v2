import type { Goal } from '../../types'
import { daysBetweenISO, mondayOf, shiftISO } from '../date'
import { linearTrend, trendPoint } from '../trend'

export interface ProjectionPoint {
  date: string
  value: number
}

export type Projection =
  | { goalId: string; status: 'projected'; date: string; ratePerWeek: number; current: number }
  | { goalId: string; status: 'reached'; current: number }
  | { goalId: string; status: 'not-enough-data'; have: number; need: number }
  | { goalId: string; status: 'away' | 'flat'; ratePerWeek: number; current: number }
  | { goalId: string; status: 'over-a-year'; ratePerWeek: number; current: number }

/** The spec's thresholds. Lifts need 6 sessions, not 14: the user's call. */
export const PROJECTION_RULES = {
  weight: { windowDays: 56, minPoints: 14, flatPerWeek: 0.05 },
  lift: { windowDays: 84, minPoints: 6, flatPerWeek: 0.1 },
} as const

/**
 * When a goal is reached at the current rate - or, honestly, that it cannot
 * be said. A confidently wrong date is worse than no date.
 */
export function projectGoal(
  goal: Pick<Goal, 'id' | 'kind' | 'target_kg' | 'start_kg'>,
  points: ProjectionPoint[],
  today: string,
): Projection {
  const rule = PROJECTION_RULES[goal.kind]
  const from = shiftISO(today, -rule.windowDays)
  const window = points
    .filter((p) => p.date > from && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (window.length < rule.minPoints) {
    return { goalId: goal.id, status: 'not-enough-data', have: window.length, need: rule.minPoints }
  }

  const first = window[0]!.date
  const trend = linearTrend(window.map((p) => ({ x: daysBetweenISO(first, p.date), y: p.value })))
  const current = trendPoint(daysBetweenISO(first, today), trend)
  const ratePerWeek = trend.slope * 7
  const target = goal.target_kg

  // A lift goal is always up. A weight goal points from where it started to
  // the target; with no starting weigh-in, from where the trend is now.
  const direction = goal.kind === 'lift' ? 1 : Math.sign(target - (goal.start_kg ?? current))
  const reached = goal.kind === 'lift'
    ? Math.max(...window.map((p) => p.value)) >= target
    : direction === 0 || (direction < 0 ? current <= target : current >= target)
  if (reached) return { goalId: goal.id, status: 'reached', current }
  if (Math.abs(ratePerWeek) < rule.flatPerWeek) return { goalId: goal.id, status: 'flat', ratePerWeek, current }
  if (Math.sign(ratePerWeek) !== direction) return { goalId: goal.id, status: 'away', ratePerWeek, current }

  // A lift's trend can sit above a target no session has actually lifted yet:
  // that reads as "this week", not as a date in the past.
  const days = Math.max(0, Math.ceil((target - current) / trend.slope))
  if (days > 365) return { goalId: goal.id, status: 'over-a-year', ratePerWeek, current }
  return { goalId: goal.id, status: 'projected', date: mondayOf(shiftISO(today, days)), ratePerWeek, current }
}
