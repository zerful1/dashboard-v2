import { toLocalISO } from './date'
import type { BodyWeightEntry } from '../types'

export function calculateStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0

  const sorted = [...completedDates].sort((a, b) => b.localeCompare(a))
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    // `i` is bounded by the loop, so both indices are populated.
    const diffMs = new Date(sorted[i - 1]!).getTime() - new Date(sorted[i]!).getTime()
    if (diffMs === 86_400_000) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// Uses toLocalISO (not toISOString) so today/yesterday are timezone-correct.
export function calcWeightStreak(entries: BodyWeightEntry[]): number {
  if (entries.length === 0) return 0
  const dates = [...entries].map(e => e.date).sort((a, b) => b.localeCompare(a))
  const today     = toLocalISO()
  const yesterday = toLocalISO(new Date(Date.now() - 86_400_000))
  if (dates[0] !== today && dates[0] !== yesterday) return 0
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    // `i` is bounded by the loop, so both indices are populated.
    const diffMs = new Date(dates[i - 1]!).getTime() - new Date(dates[i]!).getTime()
    if (diffMs === 86_400_000) {
      streak++
    } else {
      break
    }
  }
  return streak
}
