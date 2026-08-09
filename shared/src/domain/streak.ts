import { shiftISO } from './date'
import type { BodyWeightEntry } from '../types'

/**
 * Length of the run of consecutive days ending today or yesterday.
 *
 * `today` is a parameter, not an inference. A logged date is a calendar fact the
 * user asserted; recomputing "now" from the process clock is what made v1's version
 * wrong — it compared a UTC day against dates written in the browser's local day,
 * so a UK user logging between midnight and 01:00 during BST lost their streak.
 *
 * Everything here is string comparison, so the function is pure and timezone-free.
 */
export function calculateStreak(completedDates: string[], today: string): number {
  if (completedDates.length === 0) return 0

  // Future-dated entries (a mis-set device clock, a bad import) must not
  // manufacture a streak.
  const relevant = completedDates
    .filter(d => d <= today)
    .sort((a, b) => b.localeCompare(a))

  const latest = relevant[0]
  if (latest === undefined) return 0

  // A streak survives until yesterday's day is missed, so today being unlogged is
  // not yet a break.
  if (latest !== today && latest !== shiftISO(today, -1)) return 0

  let streak = 1
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i] !== shiftISO(relevant[i - 1]!, -1)) break
    streak++
  }
  return streak
}

/** Same rule, over body-weight entries. */
export function calcWeightStreak(entries: BodyWeightEntry[], today: string): number {
  return calculateStreak(entries.map(e => e.date), today)
}
