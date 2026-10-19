import { mondayOf, shiftISO } from './date'

/** One weigh-in: a date string and kilograms. */
export interface WeighInPoint {
  date: string
  kg: number
}

/** The trailing 7-day average at one weigh-in. */
export interface AveragePoint {
  date: string
  kg: number
  /** The weigh-in before this one is more than 7 days earlier: a line breaks here. */
  gapBefore: boolean
}

export type PeriodKind = 'week' | 'month'
/** 'before': a day of the first week before the first weigh-in, when there was no history to miss. */
export type DayMark = 'weighed' | 'missed' | 'future' | 'before'

/** A row of the Weight page's list (redesign part 5, §4), newest first. */
export type PeriodRow =
  | {
      kind: 'period'
      start: string
      end: string
      /** The period holding today. */
      current: boolean
      /** One decimal. Null only for a current period with nothing yet. */
      average: number | null
      /** From the rounded averages. Null when current, or when the period before had no weigh-ins. */
      change: number | null
      weighIns: number
      /** Weeks only, Monday to Sunday. */
      days: DayMark[] | null
    }
  | { kind: 'empty'; start: string; end: string }

const round1 = (n: number) => Math.round(n * 10) / 10

/** The mean of the weigh-ins dated from `from` to `to`, both included, or null with none. */
export function windowMean(points: WeighInPoint[], from: string, to: string): number | null {
  const inside = points.filter((p) => p.date >= from && p.date <= to)
  return inside.length ? inside.reduce((sum, p) => sum + p.kg, 0) / inside.length : null
}

/**
 * At each weigh-in, the mean of the weigh-ins in the 7 days ending on its date
 * (redesign part 5, §3). Looking back only, so the newest point never waits for
 * weigh-ins not yet made. Any input order; the result is oldest first.
 *
 * A sliding window: `lo` and `hi` only move forward, so it is linear in the
 * weigh-ins. Each window is summed afresh, in date order, as windowMean sums
 * it: a running total that subtracts the expired weigh-in drifts in the last
 * digit (83.8 came out 83.79999999999993), and the results must not change.
 */
export function rollingAverage(points: WeighInPoint[]): AveragePoint[] {
  const asc = [...points].sort((a, b) => a.date.localeCompare(b.date))
  let lo = 0
  let hi = 0
  return asc.map((p, i) => {
    // hi runs past every weigh-in on this date, as windowMean's filter takes them all.
    while (hi < asc.length && asc[hi]!.date <= p.date) hi++
    const from = shiftISO(p.date, -6)
    while (asc[lo]!.date < from) lo++
    let sum = 0
    for (let j = lo; j < hi; j++) sum += asc[j]!.kg
    return { date: p.date, kg: sum / (hi - lo), gapBefore: i > 0 && p.date > shiftISO(asc[i - 1]!.date, 7) }
  })
}

/** The 1st of the month after the one holding `iso`, as string maths. */
export function nextMonthStart(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

const periodStart = (kind: PeriodKind, iso: string) => (kind === 'week' ? mondayOf(iso) : `${iso.slice(0, 7)}-01`)
const nextStart = (kind: PeriodKind, start: string) => (kind === 'week' ? shiftISO(start, 7) : nextMonthStart(start))

/**
 * The weeks or months from the one holding `from` - or the first weigh-in, if
 * later: time before any history is not a gap - to the one holding today,
 * newest first (redesign part 5, §4). A run of empty periods folds into one
 * row; the current period never folds.
 */
export function periodRows(points: WeighInPoint[], kind: PeriodKind, from: string, today: string): PeriodRow[] {
  if (points.length === 0) return []
  const first = points.reduce((min, p) => (p.date < min ? p.date : min), points[0]!.date)
  const now = periodStart(kind, today)
  const rows: PeriodRow[] = []

  // Oldest first, reversed at the end: an empty run is simplest to grow going forward.
  for (let start = periodStart(kind, from > first ? from : first); start <= now; start = nextStart(kind, start)) {
    const end = shiftISO(nextStart(kind, start), -1)
    const current = start === now
    const inside = points.filter((p) => p.date >= start && p.date <= end)

    if (inside.length === 0 && !current) {
      const last = rows[rows.length - 1]
      if (last?.kind === 'empty') last.end = end
      else rows.push({ kind: 'empty', start, end })
      continue
    }

    const mean = windowMean(inside, start, end)
    const average = mean === null ? null : round1(mean)
    // The period before, from every weigh-in: the oldest listed row still compares.
    const before = windowMean(points, periodStart(kind, shiftISO(start, -1)), shiftISO(start, -1))
    const change = current || average === null || before === null ? null : round1(average - round1(before))
    const days: DayMark[] | null =
      kind === 'week'
        ? Array.from({ length: 7 }, (_, i) => {
            const d = shiftISO(start, i)
            if (d > today) return 'future'
            if (d < first) return 'before'
            return inside.some((p) => p.date === d) ? 'weighed' : 'missed'
          })
        : null

    rows.push({ kind: 'period', start, end, current, average, change, weighIns: inside.length, days })
  }
  return rows.reverse()
}
