export interface CoachingResult {
  tag: 'ADD WEIGHT' | 'ADD A REP' | 'REPEAT' | 'DELOAD'
  color: 'green' | 'amber' | 'red'
  headline: string
}

export type SessionGroup = { weight_kg: number; reps: number; is_bodyweight: boolean }[]

// Double progression: add 2.5 kg once every top-weight set hits TARGET_REPS.
const TARGET_REPS = 8

// Exercises progressed by reps alone (matched case-insensitively) — cable-stack
// jumps are too coarse for +2.5 kg advice. Ride reps to REP_ONLY_TARGET on every
// set, then move up the stack; never deload.
const REP_ONLY_EXERCISES = new Set(['cable lateral raises'])
const REP_ONLY_TARGET = 12

function heaviestSet(group: SessionGroup) {
  const weighted = group.filter(s => !s.is_bodyweight)
  if (weighted.length) {
    return weighted.reduce((best, s) => s.weight_kg > best.weight_kg ? s : best, weighted[0]!)
  }
  return group.reduce((best, s) => s.reps > best.reps ? s : best, group[0]!)
}

export function computeRecommendation(
  sessionGroups: SessionGroup[],
  exerciseName: string,
): CoachingResult | null {
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
  const repOnly = REP_ONLY_EXERCISES.has(exerciseName.trim().toLowerCase())
  const target = repOnly ? REP_ONLY_TARGET : TARGET_REPS

  // Progression is judged across every set at the session's top weight, not
  // just the best one — back-off sets at lighter weights don't count.
  const topWeightSets = latest.filter(
    s => !s.is_bodyweight && Math.abs(s.weight_kg - weight) < 0.01,
  )
  const atTarget = topWeightSets.filter(s => s.reps >= target).length
  const bestReps = topWeightSets.reduce((m, s) => Math.max(m, s.reps), 0)

  if (bestReps >= target) {
    if (atTarget === topWeightSets.length) {
      return {
        tag: 'ADD WEIGHT',
        color: 'green',
        headline: repOnly
          ? `All sets at ${target}+ — move up the stack next session`
          : `Add 2.5 kg next session — aim for ${weight + 2.5} kg × 5 reps`,
      }
    }
    return {
      tag: 'ADD A REP',
      color: 'amber',
      headline: `${atTarget} of ${topWeightSets.length} sets at ${target}+ — push the rest to ${target}`,
    }
  }

  if (repOnly || bestReps >= 5) {
    return {
      tag: 'ADD A REP',
      color: 'amber',
      headline: `Stay at ${weight} kg — push for ${bestReps + 1} reps`,
    }
  }

  // bestReps < 5 — check deload: same weight, reps < 5, across last 3 sessions
  if (sessionGroups.length >= 3) {
    const isStuck = sessionGroups.slice(0, 3).every(g => {
      const h = heaviestSet(g)
      return Math.abs(h.weight_kg - weight) < 0.01 && h.reps < 5
    })
    if (isStuck) {
      const deloadWeight = Math.round(weight * 0.9 / 2.5) * 2.5
      return {
        tag: 'DELOAD',
        color: 'red',
        headline: `Stuck for 3 sessions — drop to ${deloadWeight} kg × 6 reps`,
      }
    }
  }

  return {
    tag: 'REPEAT',
    color: 'amber',
    headline: `Stay at ${weight} kg until you hit 5 reps`,
  }
}
