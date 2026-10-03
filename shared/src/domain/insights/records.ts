/** One set with the date of its session: all a record needs. */
export interface RecordSetRow {
  date: string
  exercise_name: string
  weight_kg: number
  reps: number
  is_bodyweight: boolean
}

export interface RecordEvent {
  date: string
  exercise_name: string
  heaviest?: { weightKg: number; reps: number; previousKg: number }
  e1rm?: { valueKg: number; previousKg: number }
  reps?: { reps: number; previous: number }
}

// Compared at the 0.5 kg it is shown at, so a "record" always reads as one.
const roundHalf = (kg: number) => Math.round(kg * 2) / 2
const epley = (s: RecordSetRow) => s.weight_kg * (1 + s.reps / 30)

/** Every time an exercise beat its own best, newest first. */
export function recordEvents(rows: RecordSetRow[]): RecordEvent[] {
  const byExercise = new Map<string, Map<string, RecordSetRow[]>>()
  for (const r of rows) {
    const days = byExercise.get(r.exercise_name) ?? new Map<string, RecordSetRow[]>()
    // Keyed by date, so two sessions on one day count as one.
    days.set(r.date, [...(days.get(r.date) ?? []), r])
    byExercise.set(r.exercise_name, days)
  }

  const events: RecordEvent[] = []
  for (const [exercise_name, days] of byExercise) {
    let heaviest: number | null = null
    let e1rm: number | null = null
    let reps: number | null = null
    for (const date of [...days.keys()].sort()) {
      const sets = days.get(date)!
      const weighted = sets.filter((s) => !s.is_bodyweight)
      const event: RecordEvent = { date, exercise_name }
      // Each measure's first appearance is its baseline and raises nothing:
      // otherwise an exercise's first session would be a record on every count.
      if (weighted.length) {
        const top = weighted.reduce((a, b) =>
          b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps) ? b : a)
        if (heaviest !== null && top.weight_kg > heaviest) {
          event.heaviest = { weightKg: top.weight_kg, reps: top.reps, previousKg: heaviest }
        }
        if (heaviest === null || top.weight_kg > heaviest) heaviest = top.weight_kg
      }
      const eligible = weighted.filter((s) => s.reps >= 2 && s.reps <= 10)
      if (eligible.length) {
        const best = roundHalf(Math.max(...eligible.map(epley)))
        if (e1rm !== null && best > e1rm) event.e1rm = { valueKg: best, previousKg: e1rm }
        if (e1rm === null || best > e1rm) e1rm = best
      }
      const bodyweight = sets.filter((s) => s.is_bodyweight)
      if (bodyweight.length) {
        const best = Math.max(...bodyweight.map((s) => s.reps))
        if (reps !== null && best > reps) event.reps = { reps: best, previous: reps }
        if (reps === null || best > reps) reps = best
      }
      if (event.heaviest || event.e1rm || event.reps) events.push(event)
    }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date) || a.exercise_name.localeCompare(b.exercise_name))
}
