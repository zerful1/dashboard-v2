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

const round1 = (x: number) => Math.round(x * 10) / 10
const same = (a: number, b: number) => Math.abs(a - b) < 0.01

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
 */
export function liftStep(sessionGroups: SessionGroup[]): number {
  const tops = sessionGroups
    .map(g => g.filter(s => !s.is_bodyweight))
    .filter(g => g.length > 0)
    .map(g => Math.max(...g.map(s => s.weight_kg)))
    .reverse()
  const rises: number[] = []
  for (let i = 1; i < tops.length; i++) {
    const rise = round1(tops[i]! - tops[i - 1]!)
    const climb = rise > SMALL_RISE && rise > tops[i - 1]! * CLIMB_SHARE
    if (rise > 0 && !climb) rises.push(rise)
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
      headline: `Go up to ${round1(weight + liftStep(sessionGroups))} kg, then work back to ${TARGET_REPS}`,
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

  // Under 5. Right after a jump it's an overshoot: the lifter decides whether
  // it moved well enough to keep, or goes back to where they jumped from.
  const previous = sessionGroups[1]?.some(s => !s.is_bodyweight) ? heaviestSet(sessionGroups[1]!) : null
  if (previous && !previous.is_bodyweight && weight > previous.weight_kg + 0.01) {
    return {
      tag: 'HEAVY',
      color: 'amber',
      headline: `Heavy for now — stay at ${weight} kg if it moved well, or go back to ${previous.weight_kg} kg and build to ${TARGET_REPS}`,
    }
  }

  return {
    tag: 'REPEAT',
    color: 'amber',
    headline: `Stay at ${weight} kg — build back to ${MIN_REPS} reps`,
  }
}
