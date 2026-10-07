import { describe, it, expect } from 'vitest'
import { gridSince, trainingGrid } from '../src'

// 2026-10-07 is a Wednesday: its week starts 2026-10-05, the grid's 2026-07-20.
const WED = '2026-10-07'
const s = (id: string, date: string, day_name = 'Pull') => ({ id, date, day_name })

describe('trainingGrid', () => {
  it('lays out 12 Monday-first weeks, the current one last, later days blank', () => {
    const g = trainingGrid([], WED)
    expect(g.weeks).toHaveLength(12)
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
    expect(g.weeks[0]![0]!.date).toBe('2026-07-20')
    expect(g.weeks[11]![0]!.date).toBe('2026-10-05')
    expect(g.weeks[11]![2]).toMatchObject({ date: WED, future: false })
    expect(g.weeks[11]![3]).toMatchObject({ date: '2026-10-08', future: true })
  })

  it('crosses a month boundary without a gap', () => {
    expect(trainingGrid([], WED).weeks[10]!.map((d) => d.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  // Review focus 4.
  it('ends on today whether today is a Monday or a Sunday', () => {
    const mon = trainingGrid([], '2026-10-05').weeks[11]!
    expect(mon[0]).toMatchObject({ date: '2026-10-05', future: false })
    expect(mon[1]!.future).toBe(true)
    const sun = trainingGrid([], '2026-10-11').weeks[11]!
    expect(sun[6]).toMatchObject({ date: '2026-10-11', future: false })
    expect(sun.some((d) => d.future)).toBe(false)
  })

  it('puts each session on its day, two on one day together', () => {
    const g = trainingGrid([s('a', '2026-10-06'), s('b', '2026-10-06', 'Legs'), s('c', '2026-09-28')], WED)
    expect(g.weeks[11]![1]!.sessions.map((x) => x.id)).toEqual(['a', 'b'])
    expect(g.weeks[10]![0]!.sessions.map((x) => x.id)).toEqual(['c'])
  })

  it('averages distinct trained days over the 84 days ending today', () => {
    expect(gridSince(WED)).toBe('2026-07-16')
    const dates = ['2026-07-15', '2026-07-16', '2026-08-01', '2026-08-15', '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-06', '2026-10-06']
    // 07-15 is outside, and 10-06 twice is one day: 7 days over 12 weeks.
    expect(trainingGrid(dates.map((d, i) => s(String(i), d)), WED).perWeek).toBe(0.6)
  })
})
