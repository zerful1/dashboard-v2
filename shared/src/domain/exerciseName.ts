export interface ExerciseNameRow {
  exercise_name: string
  day_type: number
}

export interface RenameEvaluation {
  /** Another exercise on the same day already uses the new name — blocks save. */
  sameDayCollision: boolean
  /**
   * The new name matches an exercise on another day: renaming merges their
   * history and stats. Holds the existing exact casing so the save uses it
   * instead of creating a case-variant split.
   */
  mergeWith: string | null
}

export function evaluateRename(
  rows: ExerciseNameRow[],
  oldName: string,
  dayType: number,
  newName: string,
): RenameEvaluation {
  const target = newName.trim().toLowerCase()
  // Rows holding oldName are the exercise being renamed (the cascade renames
  // them on every day), so they are never a collision or merge target.
  const others = rows.filter(
    r => r.exercise_name !== oldName && r.exercise_name.toLowerCase() === target,
  )

  if (others.some(r => r.day_type === dayType)) {
    return { sameDayCollision: true, mergeWith: null }
  }

  return { sameDayCollision: false, mergeWith: others[0]?.exercise_name ?? null }
}
