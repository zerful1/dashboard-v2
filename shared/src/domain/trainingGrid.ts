import { mondayOf, shiftISO } from './date'
import type { WorkoutSession } from '../types'

export type SessionRef = Pick<WorkoutSession, 'id' | 'date' | 'day_name'>

export interface GridDay<S extends SessionRef = SessionRef> {
  date: string
  /** After today: drawn blank. */
  future: boolean
  sessions: S[]
}

export interface TrainingGrid<S extends SessionRef = SessionRef> {
  /** 12 Monday-first weeks, oldest first; each holds Monday to Sunday. */
  weeks: GridDay<S>[][]
  /** Distinct trained days in the 84 days ending today, over 12, to one decimal. */
  perWeek: number
}

export const GRID_WEEKS = 12

/** The first date the grid and its average read: the start of the 84 days ending today. */
export function gridSince(today: string): string {
  return shiftISO(today, -(GRID_WEEKS * 7 - 1))
}

/** History's 12-week grid. The current week is the last column. */
export function trainingGrid<S extends SessionRef>(sessions: S[], today: string): TrainingGrid<S> {
  const firstMonday = shiftISO(mondayOf(today), -(GRID_WEEKS - 1) * 7)
  const byDate = new Map<string, S[]>()
  for (const s of sessions) {
    const day = byDate.get(s.date)
    if (day) day.push(s)
    else byDate.set(s.date, [s])
  }
  const weeks = Array.from({ length: GRID_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = shiftISO(firstMonday, w * 7 + d)
      const future = date > today
      return { date, future, sessions: future ? [] : (byDate.get(date) ?? []) }
    }),
  )
  const since = gridSince(today)
  const trained = new Set(sessions.filter((s) => s.date >= since && s.date <= today).map((s) => s.date))
  return { weeks, perWeek: Math.round((trained.size / GRID_WEEKS) * 10) / 10 }
}
