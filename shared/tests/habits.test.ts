import { describe, it, expect } from 'vitest'
import { lastSevenDays, markDay, weekdayInitial } from '../src/domain/habits'
import type { HabitSummary } from '../src/types'

const habit = (streak: number, recent: string[]): HabitSummary => ({
  id: 'h', user_id: 'u', name: 'Skincare', emoji: null, sort_order: 1, created_at: '', streak, recent,
})

describe('lastSevenDays', () => {
  it('runs the 7 days ending today, oldest first, across a month end', () => {
    expect(lastSevenDays('2026-10-02')).toEqual([
      '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
    ])
  })
})

describe('weekdayInitial', () => {
  it('names each day by its initial', () => {
    // 2026-09-28 is a Monday.
    expect(lastSevenDays('2026-10-04').map(weekdayInitial).join('')).toBe('MTWTFSS')
  })
})

describe('markDay', () => {
  it('extends the run that ended yesterday when today is marked', () => {
    const h = markDay(habit(3, ['2026-10-01', '2026-10-02', '2026-10-03']), '2026-10-04', true, '2026-10-04')
    expect(h.streak).toBe(4)
    expect(h.recent).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('starts a run when yesterday was missed', () => {
    expect(markDay(habit(0, ['2026-10-01']), '2026-10-04', true, '2026-10-04').streak).toBe(1)
  })

  it('takes today back off the run', () => {
    const h = markDay(habit(4, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']), '2026-10-04', false, '2026-10-04')
    expect(h.streak).toBe(3)
    expect(h.recent).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('leaves the streak to the refetch when another day changes', () => {
    const h = markDay(habit(1, ['2026-10-04']), '2026-10-02', true, '2026-10-04')
    expect(h.streak).toBe(1)
    expect(h.recent).toEqual(['2026-10-02', '2026-10-04'])
  })

  it('changes nothing when the day is already as asked', () => {
    const h = habit(1, ['2026-10-04'])
    expect(markDay(h, '2026-10-04', true, '2026-10-04')).toBe(h)
  })
})
