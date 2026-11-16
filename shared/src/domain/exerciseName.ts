export interface ExerciseNameRow {
  exercise_name: string
  day_type: number
}

export interface RenameEvaluation {
  /** Another exercise on the same day already uses the new name — blocks save. */
  sameDayCollision: boolean
  /** Another day's exercise has this name, so renaming merges history; holds its exact casing. */
  mergeWith: string | null
}

export function evaluateRename(
  rows: ExerciseNameRow[],
  oldName: string,
  dayType: number,
  newName: string,
): RenameEvaluation {
  const target = newName.trim().toLowerCase()
  // Rows holding oldName are the exercise being renamed (the cascade hits every day).
  const others = rows.filter(
    r => r.exercise_name !== oldName && r.exercise_name.toLowerCase() === target,
  )

  if (others.some(r => r.day_type === dayType)) {
    return { sameDayCollision: true, mergeWith: null }
  }

  return { sameDayCollision: false, mergeWith: others[0]?.exercise_name ?? null }
}
