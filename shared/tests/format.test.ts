import { describe, it, expect } from 'vitest'
import { setCell, setLong } from '../src/domain/format'

const plain = { weight_kg: 36.3, reps: 7, is_bodyweight: false }

describe('set formatting', () => {
  it('reads a plain set as it always has', () => {
    expect(setLong(plain)).toBe('36.3kg × 7')
    // NULL sides from the database are a plain set too.
    expect(setLong({ ...plain, reps_left: null, reps_right: null })).toBe('36.3kg × 7')
  })

  it('shows both sides of a single-sided set', () => {
    const s = { ...plain, reps_left: 7, reps_right: 8 }
    expect(setLong(s)).toBe('36.3kg × L7 R8')
  })

  it('shows both sides of a bodyweight single-sided set, equal sides included', () => {
    const s = { weight_kg: 0, reps: 10, is_bodyweight: true, reps_left: 10, reps_right: 10 }
    expect(setLong(s)).toBe('BW × L10 R10')
  })

  it('reads a set for a table cell, whose column already says kg', () => {
    expect(setCell(plain)).toBe('36.3 × 7')
    expect(setCell({ ...plain, reps_left: 7, reps_right: 8 })).toBe('36.3 × L7 R8')
    expect(setCell({ ...plain, weight_kg: 0, is_bodyweight: true })).toBe('BW × 7')
  })
})
