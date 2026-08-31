import type { WorkoutSession } from '../types'
import { shiftISO } from './date'
import {
  type SplitConfig,
  getDayName,
  getTodayDayType,
  mondayIndex,
} from './splitRotation'

export interface HomeToday {
  /** null on a rest day. */
  dayType: number | null
  /** 'Push', or 'Rest day' when there is nothing scheduled. */
  label: string
  isRest: boolean
  /** A session row exists for today — it has been started. */
  started: boolean
}

export interface HomeWeek {
  /** Distinct dates with a session, inside this Mon–Sun window. */
  logged: number
  /** Training days in the split — non-rest slots in `week`. */
  target: number
  /** Monday-first, one flag per day: was a session logged that day. */
  days: boolean[]
}

export interface HomeOverview {
  today: HomeToday
  week: HomeWeek
  /** Newest session overall, or null before anything is logged. */
  lastSession: WorkoutSession | null
}

/**
 * Everything Home shows about training, from data the Gym page already caches.
 *
 * `sessions` is expected NEWEST FIRST — the order the sessions endpoint returns
 * and the order `useWorkoutHistory` preserves.
 *
 * `today` is the client's asserted calendar day, never derived here: the whole
 * date discipline is that the day arrives as a string.
 */
export function deriveHome(
  split: SplitConfig,
  sessions: WorkoutSession[],
  today: string,
): HomeOverview {
  // A local Date purely to read a weekday off it. Built from the parts, not
  // parsed from the string: `new Date('2026-08-26')` is parsed as UTC and lands
  // on the previous day for anyone behind it.
  const [y, m, d] = today.split('-').map(Number)
  const weekdayIdx = mondayIndex(new Date(y!, m! - 1, d!))
  const monday = shiftISO(today, -weekdayIdx)

  const dayType = getTodayDayType(split, new Date(y!, m! - 1, d!))
  const isRest = dayType === 'rest'

  // Distinct dates: two sessions on one day (a Push and a Pull) is one day
  // trained, not two.
  const datesTrained = new Set(sessions.map((s) => s.date))

  const days: boolean[] = []
  for (let i = 0; i < 7; i++) days.push(datesTrained.has(shiftISO(monday, i)))

  return {
    today: {
      dayType: isRest ? null : (dayType as number),
      label: isRest ? 'Rest day' : getDayName(split, dayType as number),
      isRest,
      started: datesTrained.has(today),
    },
    week: {
      logged: days.filter(Boolean).length,
      target: split.week.filter((slot) => slot !== 'rest').length,
      days,
    },
    // Newest first, so the head is the most recent. Not `today`'s session —
    // "last session" means the last one that happened, which on a rest day is
    // deliberately in the past.
    lastSession: sessions[0] ?? null,
  }
}
