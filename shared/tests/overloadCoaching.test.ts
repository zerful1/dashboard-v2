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

  it('ignores drops and repeats, and rounds away float noise', () => {
    // A cable stack: 10.2 → 11.3 → 11.3 → 10.2 → 11.3. In floats 11.3 - 10.2 is 1.1000000000000014.
    expect(liftStep([[w(11.3, 8)], [w(10.2, 8)], [w(11.3, 8)], [w(11.3, 8)], [w(10.2, 8)]])).toBe(1.1)
  })

  // At one decimal 1.25 became 1.3, and 13.75 kg was told to go up to 15.1.
  it('keeps a 1.25 kg step as 1.25', () => {
    expect(liftStep([[w(13.75, 8)], [w(12.5, 8)]])).toBe(1.25)
  })

  // 57.5 → 60, down to 55 for form, back to 60. The return used to count as a
  // 5 kg step, and as the latest rise it won the tie against the real 2.5.
  it('does not learn a step from coming back up after a drop', () => {
    expect(liftStep([[w(60, 8)], [w(55, 8)], [w(60, 6)], [w(57.5, 8)]])).toBe(2.5)
  })

  it('measures a new high from the high it beat, not from the dip before it', () => {
    // 60, down to 55, then 62.5: 2.5 over the old high, not 7.5 over the dip.
    expect(liftStep([[w(62.5, 8)], [w(55, 8)], [w(60, 8)]])).toBe(2.5)
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

    it('goes up by a 1.25 kg step to a weight that exists', () => {
      const r = computeRecommendation([[w(13.75, 8), w(13.75, 8)], [w(12.5, 8)]])
      expect(r?.headline).toBe('Go up to 15 kg, then work back to 8')
    })

    it('goes up by the real step after a drop and return', () => {
      const r = computeRecommendation([[w(60, 8), w(60, 8)], [w(55, 8)], [w(60, 6)], [w(57.5, 8)]])
      expect(r?.headline).toBe('Go up to 62.5 kg, then work back to 8')
    })

    // A stack in pounds logs as 13.6, 15.9, 18.1: its step reads 2.3 or 2.2 by
    // turns. Where the lift has been heavier, that weight is the one on the stack.
    it('names the next weight the lift has been loaded to, not weight + step', () => {
      const sessions = [
        [w(15.9, 8), w(15.9, 8)],
        [w(18.1, 4)],
        [w(15.9, 8)],
        [w(13.6, 8)],
        [w(11.3, 8)],
        [w(9.1, 8)],
        [w(6.8, 8)],
      ]
      // Rises 2.3, 2.2, 2.3, 2.3, 2.2: the step is 2.3, and 15.9 + 2.3 is 18.2,
      // which is not a plate. 18.1 is, because it has been lifted.
      expect(liftStep(sessions)).toBe(2.3)
      expect(computeRecommendation(sessions)?.headline).toBe('Go up to 18.1 kg, then work back to 8')
    })

    // 61 is 1 kg above 60 with a 2.5 kg step: a micro-load, not the next weight.
    it('ignores a stray weight much smaller than a step above', () => {
      const r = computeRecommendation([
        [w(60, 8), w(60, 8), w(60, 8)],
        [w(57.5, 8), w(57.5, 8)],
        [w(55, 8), w(55, 8)],
        [w(50, 8), w(61, 1)],
      ])
      expect(r?.headline).toBe('Go up to 62.5 kg, then work back to 8')
    })

    it('uses a heavier weight inside the window, even one logged once', () => {
      const r = computeRecommendation([
        [w(60, 8), w(60, 8)],
        [w(57.5, 8)],
        [w(55, 8)],
        [w(61.5, 1)],
      ])
      expect(r?.headline).toBe('Go up to 61.5 kg, then work back to 8')
    })

    // The window is inclusive: exactly half a step above counts (60 -> 61.25, step 2.5).
    it('counts a rung exactly half a step above', () => {
      const r = computeRecommendation([[w(60, 8)], [w(57.5, 8)], [w(55, 8)], [w(61.25, 8)]])
      expect(r?.headline).toBe('Go up to 61.25 kg, then work back to 8')
    })

    it('uses the step at an all-time high, where there is no heavier weight to read', () => {
      const r = computeRecommendation([[w(15.9, 8), w(15.9, 8)], [w(13.6, 8)], [w(11.3, 8)], [w(9.1, 8)], [w(6.8, 8)]])
      expect(r?.headline).toBe('Go up to 18.2 kg, then work back to 8')
    })

    it('falls back to the step when the only heavier weight is far above', () => {
      // A one-off 100 kg single is not the next rung from 60.
      const r = computeRecommendation([[w(60, 8), w(60, 8)], [w(100, 1)], [w(60, 7)], [w(57.5, 8)]])
      expect(r?.headline).toBe('Go up to 62.5 kg, then work back to 8')
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

    // 60 for 8, then 65 for 4, and 4 again. The second session used to read
    // "build back to 5" at a weight that never had 5, with the way back gone.
    it('is still heavy at the next session, while the new weight has never had 5', () => {
      const r = computeRecommendation([[w(65, 4)], [w(65, 4)], [w(60, 8), w(60, 8)]])
      expect(r).toEqual({
        tag: 'HEAVY',
        color: 'amber',
        headline: 'Heavy for now — stay at 65 kg if it moved well, or go back to 60 kg and build to 8',
      })
    })

    it('says build back to 5 once the weight has had 5, and no longer offers the way back', () => {
      const r = computeRecommendation([[w(65, 4)], [w(65, 6)], [w(60, 8)]])
      expect(r).toEqual({ tag: 'REPEAT', color: 'amber', headline: 'Stay at 65 kg — build back to 5 reps' })
    })

    it('says build to 5, not back, at a weight that has never had 5', () => {
      const r = computeRecommendation([[w(80, 4)], [w(80, 4)]])
      expect(r).toEqual({ tag: 'REPEAT', color: 'amber', headline: 'Stay at 80 kg — build to 5 reps' })
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
