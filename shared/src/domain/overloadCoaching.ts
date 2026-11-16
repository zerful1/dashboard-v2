export interface CoachingResult {
  tag: 'ADD WEIGHT' | 'ADD A REP' | 'REPEAT' | 'HEAVY'
  color: 'green' | 'amber'
  headline: string
}

export type SessionGroup = { weight_kg: number; reps: number; is_bodyweight: boolean }[]

/** The owner's rule: reps 5-8; every set at top weight on 8 goes up, 5-7 adds reps, under 5 is heavy. */
const TARGET_REPS = 8
const MIN_REPS = 5
/** A newest session under this share of the last working weight is skipped. */
const LIGHT_SHARE = 0.8

/** Without a jump to learn from, the plate-loaded default. */
const DEFAULT_STEP = 2.5
/** How many of the lift's latest jumps its step is learned from. */
const STEP_WINDOW = 5

/** A rise bigger than both of these is a climb to a working weight, not the step. */
const SMALL_RISE = 2.5
const CLIMB_SHARE = 0.15

/** Steps above the weight in which a heavier logged weight is 'the next rung'; else the step guides. */
const RUNG_MIN = 0.5
const RUNG_REACH = 1.5

/** To the hundredth, not the tenth: at one decimal a 1.25 kg plate became 1.3. */
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

/** The lift's step: its commonest recent rise to a new high, latest winning ties. */
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

/** The next logged weight about a step above (RUNG_MIN..RUNG_REACH): weight + step can miss by a rounding. */
function nextWeight(sessionGroups: SessionGroup[], weight: number): number {
  const step = liftStep(sessionGroups)
  const rungs = sessionGroups
    .flat()
    .filter(s => !s.is_bodyweight)
    .map(s => s.weight_kg)
    .filter(x => x - weight >= step * RUNG_MIN - 0.01 && x - weight <= step * RUNG_REACH + 0.01)
  return rungs.length ? round2(Math.min(...rungs)) : round2(weight + step)
}

/** The weight this was jumped to from while still heavy; 'held' if 5 was reached here before, else null. */
function jumpedFrom(sessionGroups: SessionGroup[], weight: number): number | 'held' | null {
  for (const group of sessionGroups.slice(1)) {
    const top = topWeight(group)
    if (top === null) continue
    if (!same(top, weight)) return top < weight ? top : null
    if (bestRepsAt(group, weight) >= MIN_REPS) return 'held'
  }
  return null
}

/** The newest session well under the last working weight: a deload or typo, which can't move advice. */
function isLight([latest, prior]: SessionGroup[]): boolean {
  const now = latest ? topWeight(latest) : null
  // Working weight: the heaviest set of 5+, so a one-off heavy single isn't one.
  const before = prior ? topWeight(prior.filter((s) => s.reps >= MIN_REPS)) : null
  return now !== null && before !== null && now < before * LIGHT_SHARE
}

/** The card's advice from sessions NEWEST FIRST: reversed, it coaches from the oldest. */
export function computeRecommendation(allGroups: SessionGroup[]): CoachingResult | null {
  const sessionGroups = isLight(allGroups) ? allGroups.slice(1) : allGroups
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

  // Progression is judged across every set at the session's top weight; back-off sets don't count.
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

  // Under 5: after a jump it is an overshoot while the new weight stays under 5, and the lifter decides.
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
