import { daysBetweenISO, shiftISO } from './date'

/** One logged set, as the lift stats read it. */
export interface LiftSetRow {
  session_id: string
  date: string
  exercise_name: string
  set_number: number
  weight_kg: number
  /** The counted reps: the lower side of a single-sided set. */
  reps: number
  reps_left: number | null
  reps_right: number | null
  is_bodyweight: boolean
}

/** A set with its session's date: what a "best" is shown as. */
export interface DatedSet {
  date: string
  weight_kg: number
  reps: number
  reps_left: number | null
  reps_right: number | null
  is_bodyweight: boolean
}

/** One session of one lift: its best set, and that set's value. */
export interface SessionBest {
  session_id: string
  date: string
  best: DatedSet
  /** Epley estimated 1RM in kg, or reps for a bodyweight-only lift. */
  value: number
}

export type LiftStatus = 'moving' | 'new' | 'stalled' | 'back' | 'old'

export interface LiftProgress {
  name: string
  status: LiftStatus
  /** The span's best set, first reached; null when the span holds no value. */
  best: DatedSet | null
  /** Moving: the rise over prior's best. Back: the fall from the span's best. A fraction. */
  change: number | null
  /** Stalled: whole weeks since the span's best was first reached. */
  weeksSinceBest: number | null
  lastDate: string
}

export interface LiftChartPoint {
  date: string
  value: number
  /** A new best within the span: drawn white. */
  isBest: boolean
}

export interface LiftSession {
  session_id: string
  date: string
  sets: LiftSetRow[]
}

export interface LiftDetail {
  progress: LiftProgress
  bodyweightOnly: boolean
  /** The all-time best, only when it beats the span's (or the span has none). */
  allTime: DatedSet | null
  points: LiftChartPoint[]
  /** The span held no session, so the chart is the lift's whole history (decided 2026-10-07). */
  chartAll: boolean
  /** Every session of the lift, newest first, its sets in order. */
  sessions: LiftSession[]
}

/** The windows, counted back from `today`, inclusive. */
const RECENT_DAYS = 42
const PRIOR_DAYS = 182
const OLD_DAYS = 56

const epley = (s: { weight_kg: number; reps: number }) => s.weight_kg * (1 + s.reps / 30)

const dated = (s: LiftSetRow): DatedSet => ({
  date: s.date,
  weight_kg: s.weight_kg,
  reps: s.reps,
  reps_left: s.reps_left,
  reps_right: s.reps_right,
  is_bodyweight: s.is_bodyweight,
})

/** The highest value; the earliest on a tie, because sessions arrive oldest first. */
const highest = (xs: SessionBest[]) => xs.reduce<SessionBest | null>((m, s) => (!m || s.value > m.value ? s : m), null)

function windows(today: string) {
  const recentStart = shiftISO(today, -(RECENT_DAYS - 1))
  return { recentStart, priorStart: shiftISO(recentStart, -PRIOR_DAYS) }
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    const g = m.get(k)
    if (g) g.push(x)
    else m.set(k, [x])
  }
  return m
}

const lastDateOf = (sets: LiftSetRow[]) => sets.reduce((m, s) => (s.date > m ? s.date : m), sets[0]!.date)

/**
 * Each session's best set, oldest first. A lift whose every set is bodyweight
 * is valued by reps; any other lift by Epley over its weighted sets, any rep
 * count, so a session of only bodyweight sets has no value and is left out.
 */
export function sessionBests(sets: LiftSetRow[]): { bodyweightOnly: boolean; sessions: SessionBest[] } {
  const bodyweightOnly = sets.length > 0 && sets.every((s) => s.is_bodyweight)
  const value = (s: LiftSetRow) => (bodyweightOnly ? s.reps : epley(s))
  const counted = bodyweightOnly ? sets : sets.filter((s) => !s.is_bodyweight)
  const sessions = [...groupBy(counted, (s) => s.session_id).values()].map((group) => {
    const top = group.reduce((b, s) =>
      value(s) > value(b) || (value(s) === value(b) && s.set_number < b.set_number) ? s : b,
    )
    return { session_id: top.session_id, date: top.date, best: dated(top), value: value(top) }
  })
  sessions.sort((a, b) => a.date.localeCompare(b.date))
  return { bodyweightOnly, sessions }
}

/** One lift's status from its session bests, oldest first, and its last date. */
export function liftStatus(name: string, sessions: SessionBest[], lastDate: string, today: string): LiftProgress {
  const { recentStart, priorStart } = windows(today)
  const span = sessions.filter((s) => s.date >= priorStart && s.date <= today)
  const best = highest(span)
  const base = { name, best: best?.best ?? null, change: null, weeksSinceBest: null, lastDate }

  if (daysBetweenISO(lastDate, today) >= OLD_DAYS) return { ...base, status: 'old' }
  const recentBest = highest(span.filter((s) => s.date >= recentStart))
  const priorBest = highest(span.filter((s) => s.date < recentStart))
  if (recentBest && !priorBest) return { ...base, status: 'new' }
  if (recentBest && priorBest && recentBest.value > priorBest.value) {
    return { ...base, status: 'moving', change: (recentBest.value - priorBest.value) / priorBest.value }
  }
  const last3 = span.slice(-3)
  // A hair of tolerance, so exactly 95% counts however Epley rounds.
  if (best && span.length >= 3 && last3.every((s) => s.value <= best.value * 0.95 + 1e-9)) {
    return { ...base, status: 'back', change: (highest(last3)!.value - best.value) / best.value }
  }
  return {
    ...base,
    status: 'stalled',
    weeksSinceBest: best ? Math.floor(daysBetweenISO(best.date, today) / 7) : null,
  }
}

/** Every lift's status: the Stats overview, the most recently trained first. */
export function liftProgress(rows: LiftSetRow[], today: string): LiftProgress[] {
  return [...groupBy(rows, (r) => r.exercise_name).entries()]
    .map(([name, sets]) => liftStatus(name, sessionBests(sets).sessions, lastDateOf(sets), today))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name))
}

/** One lift's detail, from its sets, by the same rule as the overview. */
export function liftDetail(name: string, sets: LiftSetRow[], today: string): LiftDetail | null {
  if (sets.length === 0) return null
  const { bodyweightOnly, sessions: bests } = sessionBests(sets)
  const progress = liftStatus(name, bests, lastDateOf(sets), today)

  const { priorStart } = windows(today)
  const span = bests.filter((s) => s.date >= priorStart && s.date <= today)
  const spanBest = highest(span)
  const allBest = highest(bests)
  const allTime = allBest && (!spanBest || allBest.value > spanBest.value) ? allBest.best : null

  // A lift with nothing in the span (most v1-era lifts) charts its whole history instead.
  const chartAll = span.length === 0
  // One point per date: two sessions of one lift on a day (two day types) are one day trained.
  const byDate = new Map<string, number>()
  for (const s of chartAll ? bests : span) byDate.set(s.date, Math.max(byDate.get(s.date) ?? -Infinity, s.value))
  let running = -Infinity
  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => {
      const isBest = value > running
      if (isBest) running = value
      return { date, value: Math.round(value * 10) / 10, isBest }
    })

  const sessions = [...groupBy(sets, (s) => s.session_id).values()]
    .map((g) => ({
      session_id: g[0]!.session_id,
      date: g[0]!.date,
      sets: [...g].sort((a, b) => a.set_number - b.set_number),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return { progress, bodyweightOnly, allTime, points, chartAll, sessions }
}
