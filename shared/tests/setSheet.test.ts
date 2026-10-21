import { describe, it, expect } from 'vitest'
import { lastTimeRows, sheetDefaults, type WorkoutSet } from '../src'

const s = (n: number, weight = 80, reps = 8, over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${n}-${weight}`,
  user_id: 'u1',
  session_id: 'x',
  exercise_name: 'Row',
  set_number: n,
  weight_kg: weight,
  reps,
  reps_left: null,
  reps_right: null,
  is_bodyweight: false,
  ...over,
})

describe('lastTimeRows', () => {
  it('lines today up against last time by set number, and puts the rest below', () => {
    const r = lastTimeRows([s(1, 82.5, 8), s(2, 82.5, 7)], [s(1), s(2), s(3, 80, 7), s(4, 80, 6)])
    expect(r.next).toBe(3)
    expect(r.above.map((row) => [row.n, row.last?.reps, row.today?.weight_kg])).toEqual([
      [1, 8, 82.5],
      [2, 8, 82.5],
    ])
    expect(r.nextLast?.reps).toBe(7)
    expect(r.below.map((x) => x.set_number)).toEqual([4])
  })

  it('continues from the highest set after a deleted middle one, and shows the gap', () => {
    const r = lastTimeRows([s(1), s(3)], [s(1), s(2), s(3)])
    expect(r.next).toBe(4)
    expect(r.above.map((row) => [row.n, row.today?.set_number ?? null, row.last?.set_number ?? null])).toEqual([
      [1, 1, 1],
      [2, null, 2],
      [3, 3, 3],
    ])
    expect(r.nextLast).toBeNull()
  })

  it('has nothing above set 1, and the rest of last time below it', () => {
    const r = lastTimeRows([], [s(1), s(2)])
    expect(r).toMatchObject({ next: 1, above: [] })
    expect(r.nextLast?.set_number).toBe(1)
    expect(r.below.map((x) => x.set_number)).toEqual([2])
  })

  it('works with no last time at all', () => {
    const r = lastTimeRows([s(1)], [])
    expect(r.above).toEqual([{ n: 1, last: null, today: s(1) }])
    expect(r).toMatchObject({ next: 2, nextLast: null, below: [] })
  })
})

describe('sheetDefaults', () => {
  it('starts from the previous set weight today, with last time reps as the hint', () => {
    const d = sheetDefaults([s(1, 82.5, 8), s(2, 85, 6)], [s(1), s(2), s(3, 80, 7)], 3)
    expect(d).toMatchObject({ weight: '85', weightHint: '80', repsHint: '7', bodyweight: false })
  })

  it('before the first set, leaves the weight empty and hints last time set 1', () => {
    expect(sheetDefaults([], [s(1, 80, 8), s(2, 77.5, 6)], 1)).toMatchObject({ weight: '', weightHint: '80', repsHint: '8' })
  })

  it('falls back to the final set when last time had fewer', () => {
    expect(sheetDefaults([s(1), s(2), s(3)], [s(1, 80, 8), s(2, 80, 6)], 4)).toMatchObject({ weightHint: '80', repsHint: '6' })
  })

  it('hints nothing with no last time', () => {
    expect(sheetDefaults([], [], 1)).toEqual({
      weight: '',
      weightHint: null,
      repsHint: null,
      leftHint: null,
      rightHint: null,
      bodyweight: false,
    })
  })

  it('hints each side of a single-sided set', () => {
    const sided = s(2, 30, 8, { reps_left: 8, reps_right: 10 })
    expect(sheetDefaults([], [s(1), sided], 2)).toMatchObject({ repsHint: '8', leftHint: '8', rightHint: '10' })
  })

  it('turns bodyweight on after a bodyweight set, and leaves the weight empty', () => {
    expect(sheetDefaults([s(1, 0, 10, { is_bodyweight: true })], [], 2)).toMatchObject({ bodyweight: true, weight: '' })
  })

  it('before any set, follows the matching set of last time for bodyweight', () => {
    const bw = s(1, 0, 10, { is_bodyweight: true })
    expect(sheetDefaults([], [bw], 1)).toMatchObject({ bodyweight: true, weightHint: null, repsHint: '10' })
    // The previous set today outranks last time.
    expect(sheetDefaults([s(1, 20, 10)], [bw, { ...bw, set_number: 2 }], 2).bodyweight).toBe(false)
  })
})
