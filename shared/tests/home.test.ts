import { describe, it, expect } from 'vitest'
import { deriveHome, DEFAULT_SPLIT, nextUp, workoutProgress, type SplitConfig } from '../src'
import type { WorkoutSession } from '../src'

// DEFAULT_SPLIT.week is [3,2,1,'rest',5,4,'rest'] Monday-first:
// Mon Push(3) Tue Pull(2) Wed Legs(1) Thu rest Fri Upper(5) Sat Lower(4) Sun rest
const session = (date: string, dayType = 3, dayName = 'Push'): WorkoutSession => ({
  id: `s-${date}-${dayType}`,
  user_id: 'u1',
  date,
  day_type: dayType,
  day_name: dayName,
  notes: null,
  created_at: '',
})

// 2026-08-26 is a Wednesday. Monday of that week is 2026-08-24.
const WED = '2026-08-26'

describe('deriveHome — today', () => {
  it('names the scheduled day', () => {
    const h = deriveHome(DEFAULT_SPLIT, [], WED)
    expect(h.today.label).toBe('Legs') // Wednesday
    expect(h.today.dayType).toBe(1)
    expect(h.today.isRest).toBe(false)
  })

  it('reports a rest day', () => {
    const h = deriveHome(DEFAULT_SPLIT, [], '2026-08-27') // Thursday
    expect(h.today.isRest).toBe(true)
    expect(h.today.dayType).toBeNull()
    expect(h.today.label).toBe('Rest day')
  })

  it('is not started when nothing is logged today', () => {
    expect(deriveHome(DEFAULT_SPLIT, [], WED).today.started).toBe(false)
  })

  it('is started once a session exists for today', () => {
    const h = deriveHome(DEFAULT_SPLIT, [session(WED, 1, 'Legs')], WED)
    expect(h.today.started).toBe(true)
  })

  it('uses the active split labels, not the defaults', () => {
    const custom: SplitConfig = {
      days: [{ day_type: 1, label: 'Leg Day' }],
      week: [1, 'rest', 1, 'rest', 1, 'rest', 'rest'],
    }
    expect(deriveHome(custom, [], WED).today.label).toBe('Leg Day')
    expect(deriveHome(custom, [], WED).week.target).toBe(3)
  })
})

describe('deriveHome — week', () => {
  it('counts the split’s training days as the target', () => {
    expect(deriveHome(DEFAULT_SPLIT, [], WED).week.target).toBe(5)
  })

  it('counts distinct days trained inside this Mon–Sun window', () => {
    const h = deriveHome(
      DEFAULT_SPLIT,
      [session('2026-08-26'), session('2026-08-25'), session('2026-08-24')],
      WED,
    )
    expect(h.week.logged).toBe(3)
    // Mon, Tue, Wed
    expect(h.week.days).toEqual([true, true, true, false, false, false, false])
  })

  it('counts two sessions on one day as one day trained', () => {
    const h = deriveHome(
      DEFAULT_SPLIT,
      [session(WED, 3, 'Push'), session(WED, 2, 'Pull')],
      WED,
    )
    expect(h.week.logged).toBe(1)
  })

  it('excludes last week’s sessions', () => {
    // 2026-08-23 is the Sunday BEFORE this window — the classic off-by-one.
    const h = deriveHome(DEFAULT_SPLIT, [session('2026-08-23')], WED)
    expect(h.week.logged).toBe(0)
    expect(h.week.days.every((x) => !x)).toBe(true)
  })

  it('includes Monday itself', () => {
    const h = deriveHome(DEFAULT_SPLIT, [session('2026-08-24')], WED)
    expect(h.week.logged).toBe(1)
    expect(h.week.days[0]).toBe(true)
  })

  it('includes the coming Sunday', () => {
    const h = deriveHome(DEFAULT_SPLIT, [session('2026-08-30')], WED)
    expect(h.week.logged).toBe(1)
    expect(h.week.days[6]).toBe(true)
  })

  it('treats Sunday as the END of its week, not the start', () => {
    // Sunday 2026-08-30's Monday is 2026-08-24, not 2026-08-31. Getting this
    // wrong makes a Sunday session vanish from its own week.
    const h = deriveHome(DEFAULT_SPLIT, [session('2026-08-30')], '2026-08-30')
    expect(h.week.days[6]).toBe(true)
    expect(h.week.logged).toBe(1)
  })
})

describe('deriveHome — last session', () => {
  it('is null before anything is logged', () => {
    expect(deriveHome(DEFAULT_SPLIT, [], WED).lastSession).toBeNull()
  })

  it('takes the head, since sessions arrive newest first', () => {
    const h = deriveHome(
      DEFAULT_SPLIT,
      [session('2026-08-25', 2, 'Pull'), session('2026-08-24', 3, 'Push')],
      WED,
    )
    expect(h.lastSession?.date).toBe('2026-08-25')
  })

  it('still reports a past session on a rest day', () => {
    const h = deriveHome(DEFAULT_SPLIT, [session('2026-08-26')], '2026-08-27')
    expect(h.today.isRest).toBe(true)
    expect(h.lastSession?.date).toBe('2026-08-26')
  })
})

describe('workoutProgress', () => {
  it('has not started before any set', () => {
    expect(workoutProgress(['Squat', 'Lunge'], [])).toEqual({ total: 2, done: 0, sets: 0, started: false, finished: false })
  })
  it('counts exercises with a set, and every set', () => {
    expect(workoutProgress(['Squat', 'Lunge'], ['Squat', 'Squat'])).toEqual({ total: 2, done: 1, sets: 2, started: true, finished: false })
  })
  it('is finished when every listed exercise has a set', () => {
    expect(workoutProgress(['Squat', 'Lunge'], ['Lunge', 'Squat']).finished).toBe(true)
  })
  it('ignores sets of exercises not on the list', () => {
    // A Push exercise logged on a Pull day counts as a set, not as progress.
    expect(workoutProgress(['Squat'], ['Bench Press'])).toEqual({ total: 1, done: 0, sets: 1, started: true, finished: false })
  })
  // An empty list (production's was cleared on 2026-10-03 to refill): any set finishes it.
  it('with an empty list, is finished by any set', () => {
    expect(workoutProgress([], []).finished).toBe(false)
    expect(workoutProgress([], ['Squat']).finished).toBe(true)
  })
})

describe('nextUp', () => {
  const unfinished = { finished: false }
  const finished = { finished: true }
  it('puts the weigh-in first until today has one', () => {
    expect(nextUp({ weighedInToday: false, isRest: false, workout: unfinished })).toBe('weigh-in')
  })
  it('then the workout, until it is finished', () => {
    expect(nextUp({ weighedInToday: true, isRest: false, workout: unfinished })).toBe('workout')
  })
  it('then food', () => {
    expect(nextUp({ weighedInToday: true, isRest: false, workout: finished })).toBe('food')
  })
  it('skips the workout on a rest day', () => {
    expect(nextUp({ weighedInToday: true, isRest: true, workout: null })).toBe('food')
  })
  // A source that failed is unknown, so it never claims the slot.
  it('passes over weigh-ins that failed to load', () => {
    expect(nextUp({ weighedInToday: null, isRest: false, workout: unfinished })).toBe('workout')
  })
  it('passes over a workout that failed to load', () => {
    expect(nextUp({ weighedInToday: true, isRest: false, workout: null })).toBe('food')
  })
})
