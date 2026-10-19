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

/** The spec's thresholds. Lifts need 6 sessions, not 14: the user's call. */
export const PROJECTION_RULES = {
  weight: { windowDays: 56, minPoints: 14, flatPerWeek: 0.05 },
  lift: { windowDays: 84, minPoints: 6, flatPerWeek: 0.1 },
} as const


/**
 * Whether a rate counts as flat for its kind: under the threshold, either way.
 * One test, so the rate line's "Flat", the composition line's "Weight steady"
 * and the projection's "no date at this rate" always agree.
 */
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

/**
 * The rate a projection is built on, on its own (redesign part 5): the Weight
 * page and Home show it with or without a goal, and it must be the number
 * Insights projects from, so there is one definition of it. `current` is the
 * line's value at today.
 */
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

/**
 * Whether a weight goal counts as reached with the trend at `current`: at or
 * past the target, heading from where the goal started - or, with no starting
 * weigh-in yet, from where the trend is now. One rule, so the goal line saying
 * "reached" and the rate no longer reading as progress always agree.
 */
export function weightGoalReached(goal: Pick<Goal, 'target_kg' | 'start_kg'>, current: number): boolean {
  const direction = Math.sign(goal.target_kg - (goal.start_kg ?? current))
  return direction === 0 || (direction < 0 ? current <= goal.target_kg : current >= goal.target_kg)
}

/**
 * Whether a fitted rate reads as progress: green toward the goal (trendTone,
 * from where the line stood a week ago to where it stands today), and neutral
 * once the goal is reached, when carrying on is not progress. One rule for the
 * Weight page's rate line and its composition line, so they never disagree.
 */
export function rateTone(
  fit: { current: number; ratePerWeek: number },
  goal: Pick<Goal, 'target_kg' | 'start_kg'> | null,
): 'good' | 'neutral' {
  if (goal !== null && weightGoalReached(goal, fit.current)) return 'neutral'
  return trendTone(fit.current - fit.ratePerWeek, fit.current, goal?.target_kg ?? null)
}

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
  // Reaching a lift goal is a fact - a set at the target - not a trend, so it
  // needs no minimum number of sessions. `current` is that best set.
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

  // A lift goal is always up (and was judged reached above). A weight goal
  // points from where it started to the target; with no starting weigh-in yet,
  // from where the trend is now (the first weigh-in after it fills the start).
  const direction = goal.kind === 'lift' ? 1 : Math.sign(target - (goal.start_kg ?? current))
  const reached = goal.kind === 'weight' && weightGoalReached(goal, current)
  if (reached) return { goalId: goal.id, status: 'reached', current }
  if (isFlatRate(goal.kind, ratePerWeek)) return { goalId: goal.id, status: 'flat', ratePerWeek, current }
  if (Math.sign(ratePerWeek) !== direction) return { goalId: goal.id, status: 'away', ratePerWeek, current }

  // A lift's trend can sit above a target no session has actually lifted yet:
  // that reads as "this week", not as a date in the past.
  const days = Math.max(0, Math.ceil((target - current) / slope))
  if (days > 365) return { goalId: goal.id, status: 'over-a-year', ratePerWeek, current }
  return { goalId: goal.id, status: 'projected', date: mondayOf(shiftISO(today, days)), ratePerWeek, current }
}
