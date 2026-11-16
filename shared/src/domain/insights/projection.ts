import type { Goal } from '../../types'
import { daysBetweenISO, mondayOf, shiftISO } from '../date'
import { linearTrend, trendPoint, trendTone } from '../trend'

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

/** The thresholds. Lifts need 6 sessions, not 14. */
export const PROJECTION_RULES = {
  weight: { windowDays: 56, minPoints: 14, flatPerWeek: 0.05 },
  lift: { windowDays: 84, minPoints: 6, flatPerWeek: 0.1 },
} as const


/** Under the kind's threshold either way: one test, so the rate, composition and projection lines agree. */
export function isFlatRate(kind: Goal['kind'], ratePerWeek: number): boolean {
  return Math.abs(ratePerWeek) < PROJECTION_RULES[kind].flatPerWeek
}

/** The least-squares line a projection draws on, or why there is none. `slope` is per day. */
export type TrendFit =
  | { status: 'fit'; ratePerWeek: number; current: number; slope: number }
  | { status: 'not-enough-data'; have: number; need: number }

/** A kind's window: after `today - windowDays`, up to and including today, oldest first. */
function inWindow(kind: Goal['kind'], points: ProjectionPoint[], today: string): ProjectionPoint[] {
  const from = shiftISO(today, -PROJECTION_RULES[kind].windowDays)
  return points
    .filter((p) => p.date > from && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** The projection's rate on its own, so Weight, Home and Insights share one definition. */
export function trendFit(kind: Goal['kind'], points: ProjectionPoint[], today: string): TrendFit {
  const rule = PROJECTION_RULES[kind]
  const window = inWindow(kind, points, today)
  if (window.length < rule.minPoints) {
    return { status: 'not-enough-data', have: window.length, need: rule.minPoints }
  }
  const first = window[0]!.date
  const line = linearTrend(window.map((p) => ({ x: daysBetweenISO(first, p.date), y: p.value })))
  return {
    status: 'fit',
    ratePerWeek: line.slope * 7,
    current: trendPoint(daysBetweenISO(first, today), line),
    slope: line.slope,
  }
}

/** At or past the target, heading from the goal's start (or the trend, with none): one rule for "reached". */
export function weightGoalReached(goal: Pick<Goal, 'target_kg' | 'start_kg'>, current: number): boolean {
  const direction = Math.sign(goal.target_kg - (goal.start_kg ?? current))
  return direction === 0 || (direction < 0 ? current <= goal.target_kg : current >= goal.target_kg)
}

/** Green toward the goal, neutral once reached; one rule for the rate and composition lines. */
export function rateTone(
  fit: { current: number; ratePerWeek: number },
  goal: Pick<Goal, 'target_kg' | 'start_kg'> | null,
): 'good' | 'neutral' {
  if (goal !== null && weightGoalReached(goal, fit.current)) return 'neutral'
  return trendTone(fit.current - fit.ratePerWeek, fit.current, goal?.target_kg ?? null)
}

/** When a goal is reached at the current rate, or that it can't be said: a wrong date is worse than none. */
export function projectGoal(
  goal: Pick<Goal, 'id' | 'kind' | 'target_kg' | 'start_kg'>,
  points: ProjectionPoint[],
  today: string,
): Projection {
  // Reaching a lift goal is a fact (a set at the target), so it needs no minimum sessions.
  const window = inWindow(goal.kind, points, today)
  if (goal.kind === 'lift' && window.some((p) => p.value >= goal.target_kg)) {
    return { goalId: goal.id, status: 'reached', current: Math.max(...window.map((p) => p.value)) }
  }
  const fit = trendFit(goal.kind, points, today)
  if (fit.status === 'not-enough-data') {
    return { goalId: goal.id, status: 'not-enough-data', have: fit.have, need: fit.need }
  }

  const { ratePerWeek, current, slope } = fit
  const target = goal.target_kg

  // A weight goal points from its start to the target; with no start yet, from where the trend is now.
  const direction = goal.kind === 'lift' ? 1 : Math.sign(target - (goal.start_kg ?? current))
  const reached = goal.kind === 'weight' && weightGoalReached(goal, current)
  if (reached) return { goalId: goal.id, status: 'reached', current }
  if (isFlatRate(goal.kind, ratePerWeek)) return { goalId: goal.id, status: 'flat', ratePerWeek, current }
  if (Math.sign(ratePerWeek) !== direction) return { goalId: goal.id, status: 'away', ratePerWeek, current }

  // A lift's trend can sit above a target nobody has lifted yet: that reads as "this week", not the past.
  const days = Math.max(0, Math.ceil((target - current) / slope))
  if (days > 365) return { goalId: goal.id, status: 'over-a-year', ratePerWeek, current }
  return { goalId: goal.id, status: 'projected', date: mondayOf(shiftISO(today, days)), ratePerWeek, current }
}
