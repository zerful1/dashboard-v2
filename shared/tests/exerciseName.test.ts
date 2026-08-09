import { describe, it, expect } from 'vitest'
import { evaluateRename } from '../src/domain/exerciseName'

const rows = [
  { exercise_name: 'Bench Press', day_type: 3 },
  { exercise_name: 'Lateral Raise', day_type: 3 },
  { exercise_name: 'Incline DB Press', day_type: 5 },
  { exercise_name: 'Lateral Raise', day_type: 5 },
]

describe('evaluateRename', () => {
  it('reports no collision and no merge for an unused name', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, 'Paused Bench Press')).toEqual({
      sameDayCollision: false,
      mergeWith: null,
    })
  })

  it('blocks a name already used on the same day', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, 'Lateral Raise')).toEqual({
      sameDayCollision: true,
      mergeWith: null,
    })
  })

  it('matches same-day collisions case-insensitively', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, 'lateral raise')).toEqual({
      sameDayCollision: true,
      mergeWith: null,
    })
  })

  it('allows a name used only on another day and reports the merge target', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, 'Incline DB Press')).toEqual({
      sameDayCollision: false,
      mergeWith: 'Incline DB Press',
    })
  })

  it('returns the existing exact casing as the merge target', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, 'incline db press')).toEqual({
      sameDayCollision: false,
      mergeWith: 'Incline DB Press',
    })
  })

  it('does not treat the renamed exercise itself as a collision or merge', () => {
    // Re-casing in place: 'Bench Press' → 'bench press' on the same day.
    expect(evaluateRename(rows, 'Bench Press', 3, 'bench press')).toEqual({
      sameDayCollision: false,
      mergeWith: null,
    })
  })

  it('still merges when the old name also exists on other days', () => {
    // 'Lateral Raise' lives on days 3 and 5; renaming it from day 3 to a
    // day-5 name is a merge, not a collision.
    expect(evaluateRename(rows, 'Lateral Raise', 3, 'Incline DB Press')).toEqual({
      sameDayCollision: false,
      mergeWith: 'Incline DB Press',
    })
  })

  it('trims the new name before comparing', () => {
    expect(evaluateRename(rows, 'Bench Press', 3, '  Lateral Raise  ')).toEqual({
      sameDayCollision: true,
      mergeWith: null,
    })
  })
})
