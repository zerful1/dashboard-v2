import { describe, it, expect } from 'vitest'
import { getDayOfYear, getWeekOfYear } from '../src/domain/date'

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
