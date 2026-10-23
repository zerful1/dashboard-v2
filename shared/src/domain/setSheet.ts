import type { WorkoutSet } from '../types'

export interface SheetRow {
  n: number
  /** Last time's set with this number, or null. */
  last: WorkoutSet | null
  /** Today's set with this number, or null: deleted, or never logged. */
  today: WorkoutSet | null
}

export interface SheetLayout {
  /** Every set number below `next` that appears today or last time, in order. */
  above: SheetRow[]
  /** The set being logged: one past today's HIGHEST number, never the count. */
  next: number
  /** Last time's set numbered `next`, or null. */
  nextLast: WorkoutSet | null
  /** Last time's sets numbered above `next`, in order. */
  below: WorkoutSet[]
}

/**
 * The set sheet's rows: today against last time, matched
 * by set number. `next` continues from the highest number, so deleting a middle
 * set never makes the next one collide with, and overwrite, a later one.
 */
export function lastTimeRows(today: WorkoutSet[], last: WorkoutSet[]): SheetLayout {
  const next = today.reduce((m, s) => Math.max(m, s.set_number), 0) + 1
  const t = new Map(today.map((s) => [s.set_number, s]))
  const l = new Map(last.map((s) => [s.set_number, s]))
  const numbers = [...new Set([...t.keys(), ...l.keys()])].filter((n) => n < next).sort((a, b) => a - b)
  return {
    above: numbers.map((n) => ({ n, last: l.get(n) ?? null, today: t.get(n) ?? null })),
    next,
    nextLast: l.get(next) ?? null,
    below: last.filter((s) => s.set_number > next).sort((a, b) => a.set_number - b.set_number),
  }
}

export interface SheetDefaults {
  /** The weight box's starting value: the previous set's weight today, or "". */
  weight: string
  /** Grey hints from last time's matching set; null with no last time. */
  weightHint: string | null
  repsHint: string | null
  leftHint: string | null
  rightHint: string | null
  /** Whether the Bodyweight switch starts on. */
  bodyweight: boolean
}

/**
 * What the sheet starts from for set `next`. "Previous" is today's
 * highest-numbered set; "matching" is last time's set `next`, or its final set
 * when it had fewer. Reps are only ever hinted, never filled in, so Add set
 * cannot log a set nobody typed.
 */
export function sheetDefaults(today: WorkoutSet[], last: WorkoutSet[], next: number): SheetDefaults {
  const previous = today.reduce<WorkoutSet | null>((p, s) => (!p || s.set_number > p.set_number ? s : p), null)
  const ordered = [...last].sort((a, b) => a.set_number - b.set_number)
  const match = ordered.find((s) => s.set_number === next) ?? ordered[ordered.length - 1] ?? null
  const reps = match ? String(match.reps) : null
  return {
    weight: previous && !previous.is_bodyweight ? String(previous.weight_kg) : '',
    weightHint: match && !match.is_bodyweight ? String(match.weight_kg) : null,
    repsHint: reps,
    leftHint: match?.reps_left != null ? String(match.reps_left) : reps,
    rightHint: match?.reps_right != null ? String(match.reps_right) : reps,
    bodyweight: previous ? previous.is_bodyweight : (match?.is_bodyweight ?? false),
  }
}
