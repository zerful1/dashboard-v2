import { describe, it, expect } from 'vitest'
import { setLong, setShort } from '../src/domain/format'

const plain = { weight_kg: 36.3, reps: 7, is_bodyweight: false }

describe('set formatting', () => {
  it('reads a plain set as it always has', () => {
    expect(setLong(plain)).toBe('36.3kg × 7')
    expect(setShort(plain)).toBe('36.3×7')
    // NULL sides from the database are a plain set too.
    expect(setLong({ ...plain, reps_left: null, reps_right: null })).toBe('36.3kg × 7')
  })

  it('shows both sides of a single-sided set', () => {
    const s = { ...plain, reps_left: 7, reps_right: 8 }
    expect(setLong(s)).toBe('36.3kg × L7 R8')
    expect(setShort(s)).toBe('36.3×L7 R8')
  })

  it('shows both sides of a bodyweight single-sided set, equal sides included', () => {
    const s = { weight_kg: 0, reps: 10, is_bodyweight: true, reps_left: 10, reps_right: 10 }
    expect(setLong(s)).toBe('BW × L10 R10')
    expect(setShort(s)).toBe('BW×L10 R10')
  })
})
