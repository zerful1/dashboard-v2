import { describe, it, expect } from 'vitest'
import {
  getTodayDayType,
  getDayName,
  historyFilterNames,
  mondayIndex,
  DEFAULT_SPLIT,
  type SplitConfig,
} from '../src/domain/splitRotation'

// DEFAULT_SPLIT.week = [3, 2, 1, 'rest', 5, 4, 'rest'] (Mon … Sun)
// Push, Pull, Legs, rest, Upper, Lower, rest.

describe('mondayIndex', () => {
  it('maps Monday to 0 and Sunday to 6', () => {
    expect(mondayIndex(new Date(2026, 5, 8))).toBe(0) // Monday
    expect(mondayIndex(new Date(2026, 5, 9))).toBe(1) // Tuesday
    expect(mondayIndex(new Date(2026, 5, 14))).toBe(6) // Sunday
  })
})

describe('getTodayDayType (DEFAULT_SPLIT)', () => {
  const cases: [string, Date, number | 'rest'][] = [
    ['Monday → Push (3)', new Date(2026, 5, 8), 3],
    ['Tuesday → Pull (2)', new Date(2026, 5, 9), 2],
    ['Wednesday → Legs (1)', new Date(2026, 5, 10), 1],
    ['Thursday → rest', new Date(2026, 5, 11), 'rest'],
    ['Friday → Upper (5)', new Date(2026, 5, 12), 5],
    ['Saturday → Lower (4)', new Date(2026, 5, 13), 4],
    ['Sunday → rest', new Date(2026, 5, 14), 'rest'],
    ['following Monday wraps to Push (3)', new Date(2026, 5, 15), 3],
  ]
  for (const [name, date, expected] of cases) {
    it(name, () => {
      expect(getTodayDayType(DEFAULT_SPLIT, date)).toBe(expected)
    })
  }

  it('uses the given split, not the default', () => {
    const custom: SplitConfig = {
      days: [{ day_type: 7, label: 'Full body' }],
      week: [7, 'rest', 7, 'rest', 7, 'rest', 'rest'],
    }
    expect(getTodayDayType(custom, new Date(2026, 5, 8))).toBe(7) // Monday
    expect(getTodayDayType(custom, new Date(2026, 5, 9))).toBe('rest') // Tuesday
  })
})

describe('getDayName', () => {
  it('returns the label for a known day_type', () => {
    expect(getDayName(DEFAULT_SPLIT, 3)).toBe('Push')
    expect(getDayName(DEFAULT_SPLIT, 5)).toBe('Upper')
  })

  it('falls back to Workout for an unknown day_type', () => {
    expect(getDayName(DEFAULT_SPLIT, 99)).toBe('Workout')
  })
})

describe('historyFilterNames', () => {
  it('lists current labels first, then historical-only names', () => {
    const result = historyFilterNames(
      ['Legs', 'Pull', 'Push', 'Lower', 'Upper'],
      ['Upper', 'Upper A', 'Upper B', 'Lower'],
    )
    expect(result).toEqual(['Legs', 'Pull', 'Push', 'Lower', 'Upper', 'Upper A', 'Upper B'])
  })

  it('deduplicates names shared with the current split and among history', () => {
    const result = historyFilterNames(['Push'], ['Push', 'Legs', 'Legs'])
    expect(result).toEqual(['Push', 'Legs'])
    expect(new Set(result).size).toBe(result.length)
  })

  it('returns just the current labels when there is no history', () => {
    expect(historyFilterNames(['A', 'B'], [])).toEqual(['A', 'B'])
  })
})

describe('DEFAULT_SPLIT', () => {
  it('has a 7-day week and labels every day_type used in the week', () => {
    expect(DEFAULT_SPLIT.week).toHaveLength(7)
    for (const slot of DEFAULT_SPLIT.week) {
      if (slot !== 'rest') {
        expect(getDayName(DEFAULT_SPLIT, slot)).not.toBe('Workout')
      }
    }
  })

  it('preserves the legacy day order and labels', () => {
    expect(DEFAULT_SPLIT.days).toEqual([
      { day_type: 1, label: 'Legs' },
      { day_type: 2, label: 'Pull' },
      { day_type: 3, label: 'Push' },
      { day_type: 4, label: 'Lower' },
      { day_type: 5, label: 'Upper' },
    ])
  })
})
