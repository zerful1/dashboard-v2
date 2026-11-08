import { describe, it, expect } from 'vitest'
import { computeRecommendation, liftStep } from '../src/domain/overloadCoaching'

type S = { weight_kg: number; reps: number; is_bodyweight: boolean }

function w(weight_kg: number, reps: number): S {
  return { weight_kg, reps, is_bodyweight: false }
}
function bw(reps: number): S {
  return { weight_kg: 0, reps, is_bodyweight: true }
}


// Sessions are newest first, as the server sends them.
describe('liftStep: the jump you make on this lift', () => {
  it('is the jump you make most often', () => {
    // A pulldown stack: 52 → 59 → 61.3 → 68.3, so 7, 2.3, 7.
    expect(liftStep([[w(68.3, 8)], [w(61.3, 8)], [w(59, 8)], [w(52, 8)]])).toBe(7)
  })

  it('breaks a tie with the most recent jump', () => {
    expect(liftStep([[w(47.5, 6)], [w(45, 8)], [w(40, 8)]])).toBe(2.5)
  })

  it('learns from the last 5 jumps only', () => {
    // Oldest first: 10, 10, 10, 10, then 5, 2.5, 2.5, 5. Over all of them 10 wins;
    // over the last 5 (10, 5, 2.5, 2.5, 5) it's a tie, and 5 is the more recent.
    // From 100 kg, so every 10 is a step (10%), not a climb.
    const tops = [0, 10, 20, 30, 40, 45, 47.5, 50, 55]
    expect(liftStep(tops.map((t) => [w(t + 100, 8)]).reverse())).toBe(5)
  })

  it('ignores drops and repeats, and rounds to 0.1 kg', () => {
    // A cable stack: 10.2 → 11.3 → 11.3 → 10.2 → 11.3. In floats 11.3 - 10.2 is 1.1000000000000014.
    expect(liftStep([[w(11.3, 8)], [w(10.2, 8)], [w(11.3, 8)], [w(11.3, 8)], [w(10.2, 8)]])).toBe(1.1)
  })

  it('reads the heaviest weighted set of each session', () => {
    expect(liftStep([[w(70, 8), w(60, 10), bw(12)], [w(65, 8), w(55, 10)]])).toBe(5)
  })

  // Climbing to find a working weight is not the lift's step. On the owner's
  // data these taught Kelso Shrugs 35 kg and the Calf Press 25 kg ("go up to 200 kg").
  it('ignores a climb: a rise over 2.5 kg and over 15% of the weight it rose from', () => {
    expect(liftStep([[w(60, 8)], [w(25, 8)]])).toBe(2.5) // Kelso Shrugs, +140%
    expect(liftStep([[w(73, 8)], [w(59, 8)]])).toBe(2.5) // Matrix Kelso Shrug, +24%
    expect(liftStep([[w(175, 15)], [w(150, 15)]])).toBe(2.5) // Calf Press, +17%
    // A climb doesn't hide the real step around it.
    expect(liftStep([[w(73, 8)], [w(66, 8)], [w(40, 8)]])).toBe(7) // +7 on 66 is 10.6%
  })

  it('keeps a small rise however light the weight', () => {
    // Dumbbells 10 → 12 kg is +20%, but 2 kg is the rack's own step.
    expect(liftStep([[w(12, 8)], [w(10, 8)]])).toBe(2)
  })

  it('falls back to 2.5 kg with no jump to learn from', () => {
    expect(liftStep([[w(80, 8)]])).toBe(2.5)
    expect(liftStep([[w(70, 8)], [w(80, 8)]])).toBe(2.5)
  })
})

describe('computeRecommendation', () => {
  it('returns null with no sessions', () => {
    expect(computeRecommendation([])).toBeNull()
  })

  it('short-circuits to ADD A REP for a bodyweight top set', () => {
    const r = computeRecommendation([[bw(8)]])
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('Push for 9 reps')
  })

  describe('every set at the top weight on 8+', () => {
    it('goes up, and the target after the jump is 8 again', () => {
      const r = computeRecommendation([[w(80, 8), w(80, 8), w(80, 9)]])
      expect(r).toEqual({ tag: 'ADD WEIGHT', color: 'green', headline: 'Go up to 82.5 kg, then work back to 8' })
    })

    it('goes up by the lift\'s own step', () => {
      // A pulldown stack that moves 7 kg at a time.
      const r = computeRecommendation([[w(66, 8), w(66, 8), w(66, 8)], [w(59, 8)], [w(52, 8)]])
      expect(r?.headline).toBe('Go up to 73 kg, then work back to 8')
    })

    // The owner's rule is 8 on every lift; the 12-rep exception was hard-coded for every account.
    it('treats Cable Lateral Raises like any lift', () => {
      const r = computeRecommendation([[w(10.2, 8), w(10.2, 8), w(10.2, 8)], [w(9.1, 8)]])
      expect(r).toEqual({ tag: 'ADD WEIGHT', color: 'green', headline: 'Go up to 11.3 kg, then work back to 8' })
    })

    it('ignores lighter back-off sets when judging the top weight', () => {
      expect(computeRecommendation([[w(80, 8), w(80, 8), w(70, 6)]])?.tag).toBe('ADD WEIGHT')
    })

    // A form reset (Seated Leg Curl, 73 → 66): the card coaches from what was lifted.
    it('coaches from the weight last lifted, after a drop', () => {
      const r = computeRecommendation([[w(66, 8), w(66, 8), w(66, 8)], [w(73, 8), w(73, 6)], [w(66, 8)]])
      expect(r?.headline).toBe('Go up to 73 kg, then work back to 8')
    })
  })

  it('holds at ADD A REP when the best set is 8+ but others lag', () => {
    const r = computeRecommendation([[w(80, 9), w(80, 7), w(80, 8)]])
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('2 of 3 sets at 8+ — push the rest to 8')
  })

  it('recommends ADD A REP in the 5-7 range', () => {
    const r = computeRecommendation([[w(80, 7), w(80, 6), w(80, 5)]])
    expect(r?.tag).toBe('ADD A REP')
    expect(r?.headline).toBe('Stay at 80 kg — push for 8 reps')
  })

  describe('under 5 reps', () => {
    // Cable Lateral Raises, 11.3 → 12.5 kg at 4 reps: the owner went back the next time.
    it('right after a jump, offers staying or going back to where you jumped from', () => {
      const r = computeRecommendation([[w(12.5, 4), w(12.5, 3)], [w(11.3, 8), w(11.3, 8), w(11.3, 8)]])
      expect(r).toEqual({
        tag: 'HEAVY',
        color: 'amber',
        headline: 'Heavy for now — stay at 12.5 kg if it moved well, or go back to 11.3 kg and build to 8',
      })
    })

    it('at a weight you chose to stay at, says build back to 5', () => {
      const r = computeRecommendation([[w(80, 4)], [w(80, 4)]])
      expect(r).toEqual({ tag: 'REPEAT', color: 'amber', headline: 'Stay at 80 kg — build back to 5 reps' })
    })

    it('on a first session, or after a drop, is not an overshoot', () => {
      expect(computeRecommendation([[w(80, 4)]])?.tag).toBe('REPEAT')
      expect(computeRecommendation([[w(66, 4)], [w(73, 6)]])?.tag).toBe('REPEAT')
    })

    // The 3-session deload fired once in five months; the owner drops on their own, sooner.
    it('never prescribes a deload, however long it lasts', () => {
      const r = computeRecommendation([[w(80, 4)], [w(80, 4)], [w(80, 4)], [w(80, 4)]])
      expect(r?.tag).toBe('REPEAT')
    })
  })
})
