import { shiftISO } from './date'
import type { HabitSummary } from '../types'

/** The strip's days: the 7 ending `today`, oldest first. */
export function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftISO(today, i - 6))
}

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** "M" for a Monday. UTC arithmetic on the string's own fields, so no local-midnight shift. */
export function weekdayInitial(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return INITIALS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!
}

/**
 * A summary as it will be once `date` is marked done or not, for the
 * optimistic write. Only today's tick moves the streak predictably: marking
 * today extends the run that ended yesterday (or starts one), and unmarking it
 * takes that day back off. Any other day is left to the refetch, which counts
 * from the whole history.
 */
export function markDay(h: HabitSummary, date: string, done: boolean, today: string): HabitSummary {
  if (h.recent.includes(date) === done) return h
  const recent = done ? [...h.recent, date].sort() : h.recent.filter(d => d !== date)
  const streak = date !== today ? h.streak : done ? h.streak + 1 : Math.max(0, h.streak - 1)
  return { ...h, recent, streak }
}
