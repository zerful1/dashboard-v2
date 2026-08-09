import type { WorkoutSet, CardioEntry } from '../types'

export function setShort(s: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_bodyweight'>) {
  return s.is_bodyweight ? `BW×${s.reps}` : `${s.weight_kg}×${s.reps}`
}

export function setLong(s: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_bodyweight'>) {
  return s.is_bodyweight ? `BW × ${s.reps}` : `${s.weight_kg}kg × ${s.reps}`
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
