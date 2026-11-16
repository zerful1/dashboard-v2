import { shiftISO } from './date'

/** Run of consecutive days ending today or yesterday; `today` is passed in, never read from the clock. */
export function calculateStreak(completedDates: string[], today: string): number {
  if (completedDates.length === 0) return 0

  // Future-dated entries must not manufacture a streak.
  const relevant = completedDates
    .filter(d => d <= today)
    .sort((a, b) => b.localeCompare(a))

  const latest = relevant[0]
  if (latest === undefined) return 0

  // An unlogged today is not yet a break.
  if (latest !== today && latest !== shiftISO(today, -1)) return 0

  let streak = 1
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i] !== shiftISO(relevant[i - 1]!, -1)) break
    streak++
  }
  return streak
}
