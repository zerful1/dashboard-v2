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

export interface WorkoutProgress {
  /** Exercises on today's list. */
  total: number
  /** Of those, how many have at least one set today. */
  done: number
  /** Sets logged today, on any exercise. */
  sets: number
  /** Cardio entries in today's session. */
  cardio: number
  started: boolean
  /**
   * Every listed exercise has a set; with an empty list, any set at all. Or
   * cardio with no sets: a cardio day, done (the user's call, 2026-10-06).
   */
  finished: boolean
}

/**
 * How far through today's workout (redesign part 2, §3; part 3a, §5).
 * `loggedNames` holds one entry per set logged today, its exercise_name, so its
 * length is the set count. Names match exactly, as the Gym page's own done
 * count does.
 */
export function workoutProgress(exerciseNames: string[], loggedNames: string[], cardio = 0): WorkoutProgress {
  const logged = new Set(loggedNames)
  const total = exerciseNames.length
  const done = exerciseNames.filter((n) => logged.has(n)).length
  const sets = loggedNames.length
  return {
    total,
    done,
    sets,
    cardio,
    started: sets > 0 || cardio > 0,
    finished: sets === 0 ? cardio > 0 : total > 0 ? done === total : true,
  }
}

export interface TodaysWorkout {
  dayType: number
  label: string
}

/**
 * Which workout Home shows today (redesign part 3a, §5). `scheduled` is the
 * split's day, or null on a rest day. A session already logged today wins: the
 * scheduled day's first, then the newest of any other, under its own
 * snapshotted name, because day_type is reused across split eras.
 */
export function todaysWorkout(
  scheduled: TodaysWorkout | null,
  sessions: WorkoutSession[],
  today: string,
): TodaysWorkout | null {
  const logged = sessions.filter((s) => s.date === today)
  if (scheduled && logged.some((s) => s.day_type === scheduled.dayType)) return scheduled
  const newest = [...logged].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (newest) return { dayType: newest.day_type, label: newest.day_name }
  return scheduled
}

export type HomeTop = 'weigh-in' | 'workout' | 'food'

/**
 * What claims Home's top slot: the weigh-in until today has one, then the
 * workout until it is finished, then food for the rest of the day. `null` is a
 * source that failed to load — its state is unknown, so it never claims the slot.
 */
export function nextUp(input: {
  weighedInToday: boolean | null
  isRest: boolean
  workout: { finished: boolean } | null
}): HomeTop {
  if (input.weighedInToday === false) return 'weigh-in'
  if (!input.isRest && input.workout !== null && !input.workout.finished) return 'workout'
  return 'food'
}
