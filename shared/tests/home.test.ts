import { describe, it, expect } from 'vitest'
import { deriveHome, DEFAULT_SPLIT, type SplitConfig } from '../src'
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
