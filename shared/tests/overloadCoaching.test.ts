import { describe, it, expect } from 'vitest'
import { computeRecommendation } from '../src/domain/overloadCoaching'

type S = { weight_kg: number; reps: number; is_bodyweight: boolean }

function w(weight_kg: number, reps: number): S {
  return { weight_kg, reps, is_bodyweight: false }
}
function bw(reps: number): S {
  return { weight_kg: 0, reps, is_bodyweight: true }
}

const EX = 'Bench Press'
const LATERALS = 'Cable Lateral Raises'

describe('computeRecommendation', () => {
  it('returns null with no sessions', () => {
    expect(computeRecommendation([], EX)).toBeNull()
  })

  it('short-circuits to ADD A REP for a bodyweight top set', () => {
    const r = computeRecommendation([[bw(8)]], EX)
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('Push for 9 reps')
  })

  it('recommends ADD WEIGHT only when every top-weight set hits 8+', () => {
    const r = computeRecommendation([[w(80, 8), w(80, 8), w(80, 9)]], EX)
    expect(r?.tag).toBe('ADD WEIGHT')
    expect(r?.headline).toBe('Add 2.5 kg next session — aim for 82.5 kg × 5 reps')
  })

  it('holds at ADD A REP when the best set is 8+ but others lag', () => {
    const r = computeRecommendation([[w(80, 9), w(80, 7), w(80, 8)]], EX)
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('2 of 3 sets at 8+ — push the rest to 8')
  })

  it('ignores lighter back-off sets when judging the top weight', () => {
    const r = computeRecommendation([[w(80, 8), w(80, 8), w(70, 6)]], EX)
    expect(r?.tag).toBe('ADD WEIGHT')
  })

  it('recommends ADD A REP in the 5-7 range', () => {
    const r = computeRecommendation([[w(80, 7), w(80, 6), w(80, 5)]], EX)
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('Stay at 80 kg — push for 8 reps')
  })

  it('recommends DELOAD when stuck below 5 reps for 3 sessions', () => {
    const stuck = [[w(80, 4)], [w(80, 4)], [w(80, 4)]]
    const r = computeRecommendation(stuck, EX)
    expect(r?.tag).toBe('DELOAD')
    expect(r?.headline).toBe('Stuck for 3 sessions — drop to 72.5 kg × 6 reps')
  })

  it('recommends REPEAT below 5 reps when not yet stuck', () => {
    const r = computeRecommendation([[w(80, 4)], [w(80, 4)]], EX)
    expect(r?.tag).toBe('REPEAT')
    expect(r?.headline).toBe('Stay at 80 kg until you hit 5 reps')
  })

  describe('rep-only exercises (cable lateral raises)', () => {
    it('suggests moving up the stack when every set hits 12+', () => {
      const r = computeRecommendation([[w(3.4, 12), w(3.4, 13), w(3.4, 12)]], LATERALS)
      expect(r?.tag).toBe('ADD WEIGHT')
      expect(r?.headline).toBe('All sets at 12+ — move up the stack next session')
    })

    it('pushes lagging sets to 12 when only the best set is there', () => {
      const r = computeRecommendation([[w(3.4, 12), w(3.4, 10), w(3.4, 11)]], LATERALS)
      expect(r?.tag).toBe('ADD A REP')
      expect(r?.headline).toBe('1 of 3 sets at 12+ — push the rest to 12')
    })

    it('never suggests +2.5 kg even with every set at 8+', () => {
      const r = computeRecommendation([[w(3.4, 9), w(3.4, 8), w(3.4, 8)]], LATERALS)
      expect(r?.tag).toBe('ADD A REP')
      expect(r?.headline).toBe('Stay at 3.4 kg — push for 10 reps')
    })

    it('never deloads, even when stuck below 5 reps', () => {
      const stuck = [[w(3.4, 4)], [w(3.4, 4)], [w(3.4, 4)]]
      const r = computeRecommendation(stuck, LATERALS)
      expect(r?.tag).toBe('ADD A REP')
      expect(r?.headline).toBe('Stay at 3.4 kg — push for 5 reps')
    })

    it('matches the exercise name case-insensitively', () => {
      const r = computeRecommendation([[w(3.4, 8), w(3.4, 8), w(3.4, 8)]], 'cable lateral raises')
      expect(r?.tag).toBe('ADD A REP')
    })
  })
})
