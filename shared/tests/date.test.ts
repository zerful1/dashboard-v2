import { describe, it, expect } from 'vitest'
import { daysBetweenISO, getDayOfYear, getWeekOfYear, shiftISO, todayISO } from '../src/domain/date'

describe('getDayOfYear', () => {
  it('returns 1 for Jan 1', () => {
    expect(getDayOfYear(new Date(2026, 0, 1))).toBe(1)
  })
  it('returns 138 for 18 May 2026', () => {
    expect(getDayOfYear(new Date(2026, 4, 18))).toBe(138)
  })
  it('returns 366 for 31 Dec of a leap year', () => {
    expect(getDayOfYear(new Date(2024, 11, 31))).toBe(366)
  })
})

describe('getWeekOfYear', () => {
  it('returns 1 for Jan 1', () => {
    expect(getWeekOfYear(new Date(2026, 0, 1))).toBe(1)
  })
  it('returns 20 for 18 May 2026', () => {
    expect(getWeekOfYear(new Date(2026, 4, 18))).toBe(20)
  })
})

describe('shiftISO', () => {
  it('moves forward and back by whole days', () => {
    expect(shiftISO('2026-05-09', 1)).toBe('2026-05-10')
    expect(shiftISO('2026-05-09', -1)).toBe('2026-05-08')
    expect(shiftISO('2026-05-09', 0)).toBe('2026-05-09')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftISO('2026-04-30', 1)).toBe('2026-05-01')
    expect(shiftISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(shiftISO('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftISO('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('is unaffected by a DST transition', () => {
    // 29 March 2026 is spring-forward in the UK. Calendar arithmetic, not clock
    // arithmetic, so the 23-hour day is irrelevant.
    expect(shiftISO('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftISO('2026-03-29', 1)).toBe('2026-03-30')
  })
})

describe('todayISO', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayISO('Europe/London')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('actually respects its timezone argument', () => {
    // Kiritimati is UTC+14, Midway UTC-11 — 25 hours apart, so at any instant
    // the two calendar days differ. Asserting ordering rather than values keeps
    // this true whenever the suite runs.
    const ahead = todayISO('Pacific/Kiritimati')
    const behind = todayISO('Pacific/Midway')
    expect(ahead >= behind).toBe(true)
  })
})

describe('daysBetweenISO', () => {
  it('counts whole days, signed', () => {
    expect(daysBetweenISO('2026-09-01', '2026-09-28')).toBe(27)
    expect(daysBetweenISO('2026-09-28', '2026-09-01')).toBe(-27)
    expect(daysBetweenISO('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('is not moved by the October clock change', () => {
    expect(daysBetweenISO('2026-10-24', '2026-10-26')).toBe(2)
  })
})
