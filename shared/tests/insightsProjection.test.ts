import { describe, it, expect } from 'vitest'
import { projectGoal, type ProjectionPoint } from '../src/domain/insights/projection'
import { shiftISO } from '../src/domain/date'

const TODAY = '2026-09-30' // a Wednesday: +14 and +15 days fall in the same week

/** n points ending today, every `step` days, on an exact line at `perWeek`. */
function line(n: number, endValue: number, perWeek: number, step = 1): ProjectionPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const back = (n - 1 - i) * step
    return { date: shiftISO(TODAY, -back), value: endValue - (perWeek * back) / 7 }
  })
}
const weightGoal = (target_kg: number, start_kg: number | null = 80) => ({ id: 'w', kind: 'weight' as const, target_kg, start_kg })
const liftGoal = (target_kg: number) => ({ id: 'l', kind: 'lift' as const, target_kg, start_kg: 60 })

describe('projectGoal: weight', () => {
  it('needs 14 weigh-ins in the last 8 weeks', () => {
    expect(projectGoal(weightGoal(75), line(13, 79, -0.5), TODAY)).toEqual({ goalId: 'w', status: 'not-enough-data', have: 13, need: 14 })
    expect(projectGoal(weightGoal(75), line(14, 79, -0.5), TODAY).status).toBe('projected')
  })

  it('ignores weigh-ins older than 56 days', () => {
    const old = line(20, 79, -0.5, 7) // weekly, reaching back 133 days
    expect(projectGoal(weightGoal(75), old, TODAY)).toMatchObject({ status: 'not-enough-data', have: 8 })
  })

  it('projects the date the trend meets the target, rounded to its Monday', () => {
    // From 79 at -0.5 kg a week, 78 is two weeks away: 14 days -> Wed 14 Oct -> Mon 12 Oct.
    // (Floating point may make it 15 days; Thu 15 Oct rounds to the same Monday.)
    const p = projectGoal(weightGoal(78), line(14, 79, -0.5), TODAY)
    expect(p).toMatchObject({ status: 'projected', date: '2026-10-12' })
    expect(p.status === 'projected' && p.current).toBeCloseTo(79, 6)
  })

  it('is reached when the trend is at or past the target, in either direction', () => {
    expect(projectGoal(weightGoal(79.5, 82), line(14, 79, -0.5), TODAY).status).toBe('reached')
    expect(projectGoal(weightGoal(78.5, 70), line(14, 79, 0.5), TODAY).status).toBe('reached')
  })

  it('calls a trend that moves against the goal away, in either direction', () => {
    expect(projectGoal(weightGoal(75, 80), line(14, 79, 0.3), TODAY)).toMatchObject({ status: 'away' })
    expect(projectGoal(weightGoal(85, 70), line(14, 79, -0.3), TODAY)).toMatchObject({ status: 'away' })
  })

  it('calls under 0.05 kg a week flat', () => {
    expect(projectGoal(weightGoal(75), line(14, 79, -0.04), TODAY)).toMatchObject({ status: 'flat' })
  })

  it('says over a year rather than giving a far-off date', () => {
    // 4 kg at -0.06 kg a week is about 67 weeks.
    expect(projectGoal(weightGoal(75), line(14, 79, -0.06), TODAY)).toMatchObject({ status: 'over-a-year' })
  })

  // Review focus 3: a weight goal set before any weigh-in has no start.
  it('takes the direction from the trend when there is no starting weigh-in', () => {
    expect(projectGoal(weightGoal(78, null), line(14, 79, -0.5), TODAY)).toMatchObject({ status: 'projected' })
    expect(projectGoal(weightGoal(78, null), line(14, 79, 0.5), TODAY)).toMatchObject({ status: 'away' })
  })
})

describe('projectGoal: lift', () => {
  it('needs 6 sessions in the last 12 weeks', () => {
    expect(projectGoal(liftGoal(80), line(5, 70, 1, 7), TODAY)).toMatchObject({ status: 'not-enough-data', have: 5, need: 6 })
    expect(projectGoal(liftGoal(80), line(6, 70, 1, 7), TODAY).status).toBe('projected')
  })

  it('is reached once any session in the window lifted the target', () => {
    const points = [...line(6, 70, 1, 7).slice(0, 5), { date: TODAY, value: 80 }]
    expect(projectGoal(liftGoal(80), points, TODAY).status).toBe('reached')
  })

  it('calls under 0.1 kg a week flat, and a falling trend away', () => {
    expect(projectGoal(liftGoal(80), line(6, 70, 0.05, 7), TODAY)).toMatchObject({ status: 'flat' })
    expect(projectGoal(liftGoal(80), line(6, 70, -1, 7), TODAY)).toMatchObject({ status: 'away' })
  })
})
