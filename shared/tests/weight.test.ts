import { describe, it, expect } from 'vitest'
import { nextMonthStart, periodRows, rollingAverage, windowMean, type WeighInPoint } from '../src/domain/weight'

const p = (date: string, kg: number): WeighInPoint => ({ date, kg })
const TODAY = '2026-10-14' // a Wednesday

describe('windowMean', () => {
  it('averages the weigh-ins inside the window, both ends included', () => {
    const pts = [p('2026-10-07', 80), p('2026-10-08', 82), p('2026-10-14', 84), p('2026-10-15', 99)]
    expect(windowMean(pts, '2026-10-08', '2026-10-14')).toBe(83)
  })

  it('is null with nothing inside', () => {
    expect(windowMean([p('2026-10-01', 80)], '2026-10-08', '2026-10-14')).toBeNull()
  })
})

describe('rollingAverage', () => {
  it('averages the 7 days ending on each weigh-in, and no further back', () => {
    // 1 Oct is 7 days before 8 Oct, so it falls outside 8 Oct's window.
    const line = rollingAverage([p('2026-10-01', 90), p('2026-10-02', 80), p('2026-10-08', 82)])
    expect(line.map((a) => a.kg)).toEqual([90, 85, 81])
  })

  it('sorts its input, oldest first', () => {
    expect(rollingAverage([p('2026-10-02', 80), p('2026-10-01', 90)]).map((a) => a.date)).toEqual(['2026-10-01', '2026-10-02'])
  })

  it('breaks the line after a gap of more than 7 days, and not at exactly 7', () => {
    const line = rollingAverage([p('2026-10-01', 80), p('2026-10-08', 80), p('2026-10-16', 80)])
    expect(line.map((a) => a.gapBefore)).toEqual([false, false, true])
  })
})

describe('nextMonthStart', () => {
  it('is the 1st of the following month, across a year end', () => {
    expect(nextMonthStart('2026-01-15')).toBe('2026-02-01')
    expect(nextMonthStart('2025-12-31')).toBe('2026-01-01')
  })
})

describe('periodRows: weeks', () => {
  const pts = [
    p('2026-09-28', 82.6),
    p('2026-10-05', 82.4), p('2026-10-07', 82.2),
    p('2026-10-12', 82.0), p('2026-10-13', 81.8),
  ]

  it('lists Monday-to-Sunday weeks, newest first, with averages and changes', () => {
    expect(periodRows(pts, 'week', '2026-09-28', TODAY)).toEqual([
      { kind: 'period', start: '2026-10-12', end: '2026-10-18', current: true, average: 81.9, change: null, weighIns: 2,
        days: ['weighed', 'weighed', 'missed', 'future', 'future', 'future', 'future'] },
      { kind: 'period', start: '2026-10-05', end: '2026-10-11', current: false, average: 82.3, change: -0.3, weighIns: 2,
        days: ['weighed', 'missed', 'weighed', 'missed', 'missed', 'missed', 'missed'] },
      // The week before it had no weigh-ins: nothing to compare.
      { kind: 'period', start: '2026-09-28', end: '2026-10-04', current: false, average: 82.6, change: null, weighIns: 1,
        days: ['weighed', 'missed', 'missed', 'missed', 'missed', 'missed', 'missed'] },
    ])
  })

  it('starts at the first weigh-in when the range reaches further back', () => {
    expect(periodRows(pts, 'week', '2026-06-01', TODAY).map((r) => r.start)).toEqual(['2026-10-12', '2026-10-05', '2026-09-28'])
  })

  it('starts at the range when it begins after the first weigh-in, comparing against the week before it', () => {
    const rows = periodRows(pts, 'week', '2026-10-06', TODAY)
    expect(rows.map((r) => r.start)).toEqual(['2026-10-12', '2026-10-05'])
    expect(rows[1]).toMatchObject({ change: -0.3 })
  })

  it('folds a run of empty weeks into one row, but never the current week', () => {
    const rows = periodRows([p('2026-09-07', 83), p('2026-10-05', 82)], 'week', '2026-09-01', TODAY)
    expect(rows).toEqual([
      { kind: 'period', start: '2026-10-12', end: '2026-10-18', current: true, average: null, change: null, weighIns: 0,
        days: ['missed', 'missed', 'missed', 'future', 'future', 'future', 'future'] },
      { kind: 'period', start: '2026-10-05', end: '2026-10-11', current: false, average: 82, change: null, weighIns: 1,
        days: ['weighed', 'missed', 'missed', 'missed', 'missed', 'missed', 'missed'] },
      { kind: 'empty', start: '2026-09-14', end: '2026-10-04' },
      { kind: 'period', start: '2026-09-07', end: '2026-09-13', current: false, average: 83, change: null, weighIns: 1,
        days: ['weighed', 'missed', 'missed', 'missed', 'missed', 'missed', 'missed'] },
    ])
  })

  it('takes the change from the rounded averages, so the column adds up', () => {
    // 82.26 shows as 82.3 and 82.14 as 82.1: the change reads -0.2, not the raw -0.12's -0.1.
    const rows = periodRows([p('2026-10-05', 82.26), p('2026-10-12', 82.14)], 'week', '2026-10-05', '2026-10-21')
    expect(rows[1]).toMatchObject({ start: '2026-10-12', average: 82.1, change: -0.2 })
  })

  it('is empty with no weigh-ins', () => {
    expect(periodRows([], 'week', '2026-09-01', TODAY)).toEqual([])
  })
})

describe('periodRows: months', () => {
  it('lists calendar months across a year end, without day marks', () => {
    const pts = [p('2025-11-20', 80), p('2025-12-05', 81), p('2026-01-03', 82)]
    expect(periodRows(pts, 'month', '2025-01-01', '2026-01-10')).toEqual([
      { kind: 'period', start: '2026-01-01', end: '2026-01-31', current: true, average: 82, change: null, weighIns: 1, days: null },
      { kind: 'period', start: '2025-12-01', end: '2025-12-31', current: false, average: 81, change: 1, weighIns: 1, days: null },
      { kind: 'period', start: '2025-11-01', end: '2025-11-30', current: false, average: 80, change: null, weighIns: 1, days: null },
    ])
  })
})
