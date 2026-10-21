import { describe, it, expect } from 'vitest'
import { stripDates, weekStrip } from '../../src/domain/nutrition/weekStrip'
import type { DayTotal, NutritionTarget } from '../../src/types'

const target = (effective_from: string, calories: number, protein_g: number, created_at = ''): NutritionTarget => ({
  id: `${effective_from}-${calories}`, user_id: 'u', effective_from, goal_mode: 'cut',
  calories, protein_g, fat_g: 70, carbs_g: 250, created_at,
})
const cut = target('2026-06-09', 2402, 180)
const day = (date: string, calories: number, protein_g = 100): DayTotal => ({ date, calories, protein_g })
const WED = '2026-10-07'

describe('stripDates', () => {
  it('is the 7 days ending on the end day, oldest first, across a month boundary', () => {
    expect(stripDates('2026-10-03')).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
    ])
  })
})

describe('weekStrip', () => {
  it('puts each total on its own day, and a day with nothing logged is null, not 0', () => {
    const s = weekStrip([day('2026-10-06', 2979.4, 131.2)], [cut], WED, WED)
    expect(s.days.map((d) => d.kcal)).toEqual([null, null, null, null, null, 2979, null])
    expect(s.days[5]!.protein).toBe(131)
  })

  it('ignores totals outside the seven days', () => {
    const s = weekStrip([day('2026-09-30', 2000), day('2026-10-08', 2000)], [cut], WED, WED)
    expect(s.days.every((d) => d.kcal === null)).toBe(true)
  })

  it('is over only strictly past the target, and never flags under', () => {
    const s = weekStrip([day('2026-10-04', 2402), day('2026-10-05', 2403), day('2026-10-06', 900)], [cut], WED, WED)
    expect(s.days.slice(3, 6).map((d) => d.over)).toEqual([false, true, false])
    expect(s.over).toBe(1)
  })

  it('compares rounded kcal, like the day figure', () => {
    // 2402.4 shows as 2,402: not "0 over".
    expect(weekStrip([day('2026-10-06', 2402.4)], [cut], WED, WED).days[5]!.over).toBe(false)
  })

  it('counts today as over once it is, and marks it in progress', () => {
    expect(weekStrip([day(WED, 2500)], [cut], WED, WED).days[6]).toMatchObject({ over: true, inProgress: true })
  })

  it('gives each day the target in force that day', () => {
    const s = weekStrip(
      [day('2026-10-02', 2300), day('2026-10-06', 2300)],
      [cut, target('2026-10-05', 2200, 170)],
      WED, WED,
    )
    expect(s.days[1]!.target).toEqual({ calories: 2402, protein_g: 180 })
    expect(s.days[5]!.target).toEqual({ calories: 2200, protein_g: 170 })
    expect(s.days[1]!.over).toBe(false)
    expect(s.days[5]!.over).toBe(true)
  })

  it('leaves a day before any target without one', () => {
    const s = weekStrip([day('2026-10-02', 3000), day('2026-10-06', 3000)], [target('2026-10-05', 2402, 180)], WED, WED)
    expect(s.days[1]).toMatchObject({ target: null, over: false, proteinHit: false })
    expect(s.days[5]!.over).toBe(true)
  })

  // Production holds two rows with the same effective_from.
  it('takes the newer of two targets from the same day', () => {
    const older = target('2026-06-09', 2402, 180, '2026-06-09T10:00:00Z')
    const newer = target('2026-06-09', 2200, 170, '2026-06-09T11:00:00Z')
    expect(weekStrip([day(WED, 2300)], [older, newer], WED, WED).days[6]!.target!.calories).toBe(2200)
  })

  it('reaches protein at exactly the target', () => {
    const s = weekStrip([day('2026-10-05', 2000, 180), day('2026-10-06', 2000, 179.4)], [cut], WED, WED)
    expect(s.days[4]!.proteinHit).toBe(true)
    expect(s.days[5]!.proteinHit).toBe(false)
  })

  it('averages days with something logged, leaving out empty days and today', () => {
    expect(weekStrip([day('2026-10-04', 2000), day('2026-10-06', 3000), day(WED, 500)], [cut], WED, WED).avg).toBe(2500)
  })

  it('has no average with only today logged, or nothing', () => {
    expect(weekStrip([day(WED, 1800)], [cut], WED, WED).avg).toBeNull()
    expect(weekStrip([], [cut], WED, WED).avg).toBeNull()
  })

  it('counts a past week whole: no day in it is in progress', () => {
    const s = weekStrip([day('2026-09-30', 2000)], [cut], '2026-09-30', WED)
    expect(s.days.some((d) => d.inProgress)).toBe(false)
    expect(s.avg).toBe(2000)
  })

  it('has no over count, rather than 0, with no targets at all', () => {
    const s = weekStrip([day('2026-10-06', 5000)], [], WED, WED)
    expect(s.over).toBeNull()
    expect(s.days[5]).toMatchObject({ target: null, over: false, proteinHit: false })
  })

  it('counts none over as 0 when there are targets', () => {
    expect(weekStrip([day('2026-10-06', 2000)], [cut], WED, WED).over).toBe(0)
  })
})
