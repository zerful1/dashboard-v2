import { describe, it, expect } from 'vitest'
import { liftDetail, liftProgress, sessionBests, type LiftSetRow } from '../src'

// 2026-10-06 is a Tuesday. recent = 2026-08-26..10-06; prior = 2026-02-25..08-25;
// a last session on or before 2026-08-11 (56 days) is "old".
const TODAY = '2026-10-06'

const set = (name: string, date: string, weight: number, reps: number, over: Partial<LiftSetRow> = {}): LiftSetRow => ({
  session_id: `${name}-${date}`,
  date,
  exercise_name: name,
  set_number: 1,
  weight_kg: weight,
  reps,
  reps_left: null,
  reps_right: null,
  is_bodyweight: false,
  ...over,
})
const bw = (name: string, date: string, reps: number, over: Partial<LiftSetRow> = {}) =>
  set(name, date, 0, reps, { is_bodyweight: true, ...over })
const status = (rows: LiftSetRow[]) => liftProgress(rows, TODAY)[0]!

describe('sessionBests', () => {
  it('values a weighted lift by Epley over its weighted sets only', () => {
    const r = sessionBests([
      set('Pull Up', '2026-09-01', 10, 8),
      bw('Pull Up', '2026-09-01', 15, { set_number: 2 }),
      bw('Pull Up', '2026-09-08', 12),
    ])
    expect(r.bodyweightOnly).toBe(false)
    // The bodyweight sets are no 0 kg best, and a session of
    // only bodyweight sets has no value at all.
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0]!.value).toBeCloseTo(10 * (1 + 8 / 30))
  })

  it('values a bodyweight-only lift by reps, the lower side of a single-sided set', () => {
    const r = sessionBests([bw('Dips', '2026-09-01', 8, { reps_left: 8, reps_right: 10 })])
    expect(r.bodyweightOnly).toBe(true)
    expect(r.sessions[0]).toMatchObject({ value: 8, best: { reps_left: 8, reps_right: 10 } })
  })

  it('counts any rep count, and orders sessions oldest first', () => {
    const r = sessionBests([set('Face Pull', '2026-09-08', 20, 15), set('Face Pull', '2026-09-01', 20, 12)])
    expect(r.sessions.map((s) => s.date)).toEqual(['2026-09-01', '2026-09-08'])
    expect(r.sessions[1]!.value).toBeCloseTo(20 * 1.5)
  })
})

describe('liftProgress', () => {
  it('counts the 42nd day back as prior and the 41st as recent', () => {
    // If 08-25 counted as recent there would be no prior, and the lift would be "new".
    expect(status([set('Row', '2026-08-25', 100, 5), set('Row', '2026-08-26', 104, 5)]).status).toBe('moving')
  })

  it('folds a lift away at 56 days, not at 55', () => {
    expect(status([set('Row', '2026-08-11', 100, 5)])).toMatchObject({ status: 'old', lastDate: '2026-08-11' })
    expect(status([set('Row', '2026-08-12', 100, 5)]).status).toBe('stalled')
  })

  it('calls a lift new when nothing falls in the prior window', () => {
    expect(status([set('Row', '2026-09-01', 60, 8), set('Row', '2026-09-08', 62.5, 8)]).status).toBe('new')
  })

  it('reports the rise over prior as a fraction', () => {
    const p = status([set('Row', '2026-07-01', 100, 5), set('Row', '2026-09-15', 104, 5)])
    expect(p.status).toBe('moving')
    expect(p.change).toBeCloseTo(0.04)
  })

  it('is not moving on a tie, and counts weeks since the best was first reached', () => {
    const p = status([
      set('Row', '2026-07-28', 100, 5),
      set('Row', '2026-08-18', 100, 5),
      set('Row', '2026-09-15', 100, 5),
    ])
    expect(p.status).toBe('stalled')
    expect(p.best?.date).toBe('2026-07-28')
    expect(p.weeksSinceBest).toBe(10)
  })

  it('goes back at exactly 95% of the span best over the last three sessions', () => {
    const rows = (r: number) => [bw('Dips', '2026-06-01', 40), bw('Dips', '2026-09-01', r), bw('Dips', '2026-09-15', r), bw('Dips', '2026-10-01', r)]
    const back = status(rows(38))
    expect(back.status).toBe('back')
    expect(back.change).toBeCloseTo(-0.05)
    expect(status(rows(39)).status).toBe('stalled')
  })

  it('needs three sessions in the span to go back', () => {
    expect(status([bw('Dips', '2026-06-01', 40), bw('Dips', '2026-09-01', 30)]).status).toBe('stalled')
  })

  it('lists every lift, the most recently trained first', () => {
    const rows = [set('Row', '2026-09-01', 60, 8), set('Squat', '2026-10-01', 100, 5), set('Row', '2026-09-08', 60, 8)]
    expect(liftProgress(rows, TODAY).map((p) => p.name)).toEqual(['Squat', 'Row'])
  })
})

describe('liftDetail', () => {
  it('shows the all-time best only when it beats the span', () => {
    const withOld = liftDetail('Row', [set('Row', '2025-03-14', 100, 5), set('Row', '2026-09-01', 70, 8), set('Row', '2026-10-02', 75, 8)], TODAY)!
    expect(withOld.progress.best).toMatchObject({ date: '2026-10-02', weight_kg: 75 })
    expect(withOld.allTime).toMatchObject({ date: '2025-03-14', weight_kg: 100 })
    const within = liftDetail('Row', [set('Row', '2026-09-01', 70, 8), set('Row', '2026-10-02', 75, 8)], TODAY)!
    expect(within.allTime).toBeNull()
  })

  it('charts one point per date in the span, white where it sets a new best', () => {
    const d = liftDetail('Row', [
      set('Row', '2025-03-14', 100, 5),
      set('Row', '2026-09-01', 70, 8),
      set('Row', '2026-09-08', 72.5, 8),
      set('Row', '2026-09-15', 70, 8),
      set('Row', '2026-09-22', 75, 8),
    ], TODAY)!
    expect(d.points.map((p) => [p.date, p.isBest])).toEqual([
      ['2026-09-01', true],
      ['2026-09-08', true],
      ['2026-09-15', false],
      ['2026-09-22', true],
    ])
    expect(d.points[0]!.value).toBe(88.7)
    expect(d.chartAll).toBe(false)
  })

  // Most production lifts are v1-era, with nothing in the span.
  it('charts the whole history of a lift with nothing in the span', () => {
    const d = liftDetail('Row', [
      set('Row', '2025-03-14', 100, 5),
      set('Row', '2025-04-01', 90, 5),
      set('Row', '2025-05-01', 105, 5),
    ], TODAY)!
    expect(d.chartAll).toBe(true)
    expect(d.points.map((p) => [p.date, p.isBest])).toEqual([
      ['2025-03-14', true],
      ['2025-04-01', false],
      ['2025-05-01', true],
    ])
  })

  it('keeps the higher of two sessions on one date as its point, and lists both sessions', () => {
    // The higher session first: a last-wins point would keep 70 kg and fail.
    const d = liftDetail('Row', [
      set('Row', '2026-09-01', 80, 8, { session_id: 'b' }),
      set('Row', '2026-09-01', 70, 8, { session_id: 'a' }),
    ], TODAY)!
    expect(d.points).toHaveLength(1)
    expect(d.points[0]!.value).toBeCloseTo(101.3, 1)
    expect(d.sessions.map((s) => s.session_id).sort()).toEqual(['a', 'b'])
  })

  it('lists every session newest first, its sets in order', () => {
    const d = liftDetail('Row', [
      set('Row', '2026-09-01', 70, 8, { set_number: 2 }),
      set('Row', '2026-09-01', 70, 9, { set_number: 1 }),
      set('Row', '2026-09-08', 72.5, 8),
    ], TODAY)!
    expect(d.sessions.map((s) => s.date)).toEqual(['2026-09-08', '2026-09-01'])
    expect(d.sessions[1]!.sets.map((s) => s.set_number)).toEqual([1, 2])
  })

  it('is null for a lift with no sets', () => {
    expect(liftDetail('Row', [], TODAY)).toBeNull()
  })
})
