export interface CoachingResult {
  tag: 'ADD WEIGHT' | 'ADD A REP' | 'REPEAT' | 'HEAVY'
  color: 'green' | 'amber'
  headline: string
}

export type SessionGroup = { weight_kg: number; reps: number; is_bodyweight: boolean }[]

/**
 * The owner's rule, for every lift: reps 5–8. Every set at the top weight on 8
 * goes up a step; 5–7 stays and adds reps; under 5 is heavy, not failure.
 * Going up early, dropping for form and staying at 4 are the lifter's calls,
 * so the card always coaches from whatever was last lifted and never says to
 * undo it. (Decided 2026-11-08, from a replay over the owner's history.)
 */
const TARGET_REPS = 8
const MIN_REPS = 5

/** Without a jump to learn from, the plate-loaded default. */
const DEFAULT_STEP = 2.5
/** How many of the lift's latest jumps its step is learned from. */
const STEP_WINDOW = 5

/**
 * A rise bigger than both of these is a climb to find a working weight, not
 * the lift's step: on the owner's data such climbs taught Kelso Shrugs 35 kg
 * and the Calf Press 25 kg. Under 2.5 kg a rise always counts, so a light
 * dumbbell's 2 kg (+20% at 10 kg) is still learned.
 */
const SMALL_RISE = 2.5
const CLIMB_SHARE = 0.15

/**
 * To the hundredth, not the tenth: a 1.25 kg plate is a real step, and at one
 * decimal it became 1.3, so 13.75 kg was told to go up to 15.1.
 */
const round2 = (x: number) => Math.round(x * 100) / 100
const same = (a: number, b: number) => Math.abs(a - b) < 0.01

/** A session's heaviest weighted set's weight, or null when it has none. */
function topWeight(group: SessionGroup): number | null {
  const weighted = group.filter(s => !s.is_bodyweight)
  return weighted.length ? Math.max(...weighted.map(s => s.weight_kg)) : null
}

/** The most reps on any set at `weight` in the session. */
const bestRepsAt = (group: SessionGroup, weight: number) =>
  group.reduce((m, s) => (!s.is_bodyweight && same(s.weight_kg, weight) ? Math.max(m, s.reps) : m), 0)

function heaviestSet(group: SessionGroup) {
  const weighted = group.filter(s => !s.is_bodyweight)
  if (weighted.length) {
    return weighted.reduce((best, s) => s.weight_kg > best.weight_kg ? s : best, weighted[0]!)
  }
  return group.reduce((best, s) => s.reps > best.reps ? s : best, group[0]!)
}

/**
 * The lift's own step: the rise in top weight it makes most often among its
 * last few rises, the most recent winning a tie. A pulldown stack goes up 7 kg,
 * a cable 2.3, dumbbells 2, where a flat 2.5 kg named a weight that isn't on
 * the stack. Sessions arrive newest first.
 *
 * Only a rise to a new high counts, measured from the high it beat. Coming
 * back up after a drop is not a step: 60, down to 55 for form, back to 60
 * taught a 5 kg step on a lift that moves in 2.5s, and the latest rise wins a
 * tie, so one such return was enough to send 60 to 65.
 */
export function liftStep(sessionGroups: SessionGroup[]): number {
  const tops = sessionGroups
    .map(topWeight)
    .filter((t): t is number => t !== null)
    .reverse()
  const rises: number[] = []
  let high = tops[0] ?? 0
  for (const top of tops.slice(1)) {
    if (top <= high + 0.001) continue
    const rise = round2(top - high)
    const climb = rise > SMALL_RISE && rise > high * CLIMB_SHARE
    if (!climb) rises.push(rise)
    high = top
  }
  const recent = rises.slice(-STEP_WINDOW)
  let step = DEFAULT_STEP
  let most = 0
  // Oldest to newest, so a later rise ties its way in.
  for (const r of recent) {
    const n = recent.filter(x => x === r).length
    if (n >= most) {
      most = n
      step = r
    }
  }
  return step
}

/**
 * The weight to go up to. The next weight above this one that the lift has
 * actually been loaded to, when there is one about a step away: it is on the
 * stack by definition, where weight + step can miss by a rounding (a stack in
 * pounds logs as 13.6, 15.9, 18.1, so its step reads 2.3 or 2.2 by turns, and
 * 15.9 + 2.3 is 18.2). At an all-time high there is nothing to read, and it
 * is weight + step.
 *
 * "About a step": within one and a half. A weight further off is a climb or a
 * one-off, not the next rung, and the step is the better guide.
 */
function nextWeight(sessionGroups: SessionGroup[], weight: number): number {
  const step = liftStep(sessionGroups)
  const above = sessionGroups
    .flat()
    .filter(s => !s.is_bodyweight && s.weight_kg > weight + 0.01)
    .map(s => s.weight_kg)
  const rung = above.length ? Math.min(...above) : null
  return rung !== null && rung - weight <= step * 1.5 + 0.01 ? round2(rung) : round2(weight + step)
}

/**
 * The weight this one was jumped to from, while it is still heavy: every
 * session at `weight` so far has stayed under 5. Null when it is not an
 * overshoot (nothing lighter came before), and 'held' when 5 was reached at
 * this weight before, so this is a dip rather than a jump too far.
 *
 * It looks back past the first session at the new weight on purpose. 60 for 8,
 * then 65 for 4 twice: the second time the card said "build back to 5", at a
 * weight that never had 5, and the way back to 60 was gone after one session.
 */
function jumpedFrom(sessionGroups: SessionGroup[], weight: number): number | 'held' | null {
  for (const group of sessionGroups.slice(1)) {
    const top = topWeight(group)
    if (top === null) continue
    if (!same(top, weight)) return top < weight ? top : null
    if (bestRepsAt(group, weight) >= MIN_REPS) return 'held'
  }
  return null
}

/**
 * The card's advice from the lift's sessions, NEWEST FIRST (the server's
 * order; reversed, it would coach confidently from the oldest session).
 */
export function computeRecommendation(sessionGroups: SessionGroup[]): CoachingResult | null {
  if (sessionGroups.length === 0) return null

  const latest = sessionGroups[0]!
  const top = heaviestSet(latest)

  if (top.is_bodyweight) {
    return {
      tag: 'ADD A REP',
      color: 'amber',
      headline: `Push for ${top.reps + 1} reps`,
    }
  }

  const weight = top.weight_kg

  // Progression is judged across every set at the session's top weight, not
  // just the best one — back-off sets at lighter weights don't count.
  const topWeightSets = latest.filter(s => !s.is_bodyweight && same(s.weight_kg, weight))
  const atTarget = topWeightSets.filter(s => s.reps >= TARGET_REPS).length
  const bestReps = topWeightSets.reduce((m, s) => Math.max(m, s.reps), 0)

  if (atTarget === topWeightSets.length) {
    return {
      tag: 'ADD WEIGHT',
      color: 'green',
      headline: `Go up to ${nextWeight(sessionGroups, weight)} kg, then work back to ${TARGET_REPS}`,
    }
  }

  if (bestReps >= TARGET_REPS) {
    return {
      tag: 'ADD A REP',
      color: 'amber',
      headline: `${atTarget} of ${topWeightSets.length} sets at ${TARGET_REPS}+ — push the rest to ${TARGET_REPS}`,
    }
  }

  if (bestReps >= MIN_REPS) {
    return {
      tag: 'ADD A REP',
      color: 'amber',
      headline: `Stay at ${weight} kg — push for ${bestReps + 1} reps`,
    }
  }

  // Under 5. After a jump it's an overshoot, for as long as the new weight
  // stays under 5: the lifter decides whether it moved well enough to keep, or
  // goes back to where they jumped from.
  const from = jumpedFrom(sessionGroups, weight)
  if (typeof from === 'number') {
    return {
      tag: 'HEAVY',
      color: 'amber',
      headline: `Heavy for now — stay at ${weight} kg if it moved well, or go back to ${from} kg and build to ${TARGET_REPS}`,
    }
  }

  return {
    tag: 'REPEAT',
    color: 'amber',
    // "Back" only when 5 was reached here before; otherwise there is no back.
    headline: `Stay at ${weight} kg — build ${from === 'held' ? 'back ' : ''}to ${MIN_REPS} reps`,
  }
}
