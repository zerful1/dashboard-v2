import type { WorkoutSet, CardioEntry } from '../types'

type ShownSet = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_bodyweight'> &
  Partial<Pick<WorkoutSet, 'reps_left' | 'reps_right'>>

/** Both sides when the set has them; summaries pass the counted reps alone. */
function repsText(s: ShownSet) {
  return s.reps_left != null && s.reps_right != null ? `L${s.reps_left} R${s.reps_right}` : `${s.reps}`
}

export function setShort(s: ShownSet) {
  return s.is_bodyweight ? `BW×${repsText(s)}` : `${s.weight_kg}×${repsText(s)}`
}

export function setLong(s: ShownSet) {
  return s.is_bodyweight ? `BW × ${repsText(s)}` : `${s.weight_kg}kg × ${repsText(s)}`
}

/** "80 × 8", "BW × 10", "30 × L10 R10": a set in a table whose column already says kg. */
export function setCell(s: ShownSet) {
  return s.is_bodyweight ? `BW × ${repsText(s)}` : `${s.weight_kg} × ${repsText(s)}`
}

export function cardioLine(entry: CardioEntry): string {
  const parts: string[] = [entry.exercise]
  if (entry.distance_miles != null) parts.push(`${entry.distance_miles}mi`)
  if (entry.duration_minutes != null) parts.push(`${entry.duration_minutes}min`)
  if (entry.speed != null) parts.push(`${entry.speed}mph`)
  if (entry.incline != null) parts.push(`${entry.incline}%`)
  if (entry.calories_burned != null) parts.push(`${entry.calories_burned}cal`)
  return parts.join(' · ')
}
