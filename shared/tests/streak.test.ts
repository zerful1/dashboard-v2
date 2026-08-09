import { describe, it, expect } from 'vitest'
import { calculateStreak, calcWeightStreak } from '../src/domain/streak'
import type { BodyWeightEntry } from '../src/types'

// No fake timers and no TZ dependency: the current day is an argument, so these
// tests behave identically on any machine in any timezone.
const TODAY = '2026-05-09'
const YESTERDAY = '2026-05-08'

function makeEntry(date: string): BodyWeightEntry {
  return { id: crypto.randomUUID(), user_id: 'u', date, weight_kg: 70, notes: null, created_at: '' }
}

describe('calculateStreak', () => {
  it('returns 0 for empty completions', () => {
    expect(calculateStreak([], TODAY)).toBe(0)
  })

  it('returns 0 when last completion was 2+ days ago', () => {
    expect(calculateStreak(['2026-05-06', '2026-05-05'], TODAY)).toBe(0)
  })

  it('returns 1 for a single completion today', () => {
    expect(calculateStreak([TODAY], TODAY)).toBe(1)
  })

  it('returns 1 for a single completion yesterday', () => {
    expect(calculateStreak([YESTERDAY], TODAY)).toBe(1)
  })

  it('counts a consecutive streak ending today', () => {
    expect(calculateStreak([TODAY, YESTERDAY, '2026-05-07'], TODAY)).toBe(3)
  })

  it('stops counting at a gap', () => {
    expect(calculateStreak([TODAY, YESTERDAY, '2026-05-07', '2026-05-04'], TODAY)).toBe(3)
  })

  it('counts across a month boundary', () => {
    expect(calculateStreak(['2026-05-01', '2026-04-30', '2026-04-29'], '2026-05-01')).toBe(3)
  })

  it('counts across the BST transition', () => {
    // 29 March 2026 is the spring-forward day in the UK. Because dates are plain
    // strings rather than instants, a 23-hour day is not a special case.
    expect(calculateStreak(['2026-03-30', '2026-03-29', '2026-03-28'], '2026-03-30')).toBe(3)
  })

  it('ignores a future-dated entry rather than counting it', () => {
    expect(calculateStreak(['2026-05-20'], TODAY)).toBe(0)
  })
})

describe('calcWeightStreak', () => {
  it('returns 0 for empty entries', () => {
    expect(calcWeightStreak([], TODAY)).toBe(0)
  })

  it('returns 0 when last entry was 2+ days ago', () => {
    expect(calcWeightStreak([makeEntry('2026-05-06'), makeEntry('2026-05-05')], TODAY)).toBe(0)
  })

  it('returns 1 for a single entry today', () => {
    expect(calcWeightStreak([makeEntry(TODAY)], TODAY)).toBe(1)
  })

  it('returns 1 for a single entry yesterday', () => {
    expect(calcWeightStreak([makeEntry(YESTERDAY)], TODAY)).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(calcWeightStreak([
      makeEntry(TODAY), makeEntry(YESTERDAY), makeEntry('2026-05-07'),
    ], TODAY)).toBe(3)
  })

  it('stops at a gap', () => {
    expect(calcWeightStreak([
      makeEntry(TODAY), makeEntry(YESTERDAY), makeEntry('2026-05-07'), makeEntry('2026-05-04'),
    ], TODAY)).toBe(3)
  })
})
