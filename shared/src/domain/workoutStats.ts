export interface StatSetRow {
  session_id: string
  weight_kg: number
  reps: number
  is_bodyweight: boolean
}

export interface ExerciseChartPoint {
  date: string
  topWeight: number | null
  e1rm: number | null
  volume: number | null
  topReps: number | null
}

export interface ExerciseStats {
  heaviestSet: { weight_kg: number; reps: number; is_bodyweight: boolean } | null
  bestOneRM: number | null
  isBodyweightOnly: boolean
  sessionCount: number
  lastTrainedDate: string | null
  delta30: { value: number; unit: 'kg' | 'reps' } | null
  chartData: ExerciseChartPoint[]
}

const DAY_MS = 86_400_000

function epley(s: StatSetRow) {
  return s.weight_kg * (1 + s.reps / 30)
}

// 30-day change of the per-session top value (top weight; top reps when
// bodyweight-only). Baseline = most recent session ≥30 days before the latest;
// when every session is within 30 days, the earliest session.
function computeDelta30(
  chartData: ExerciseChartPoint[],
  isBodyweightOnly: boolean,
): ExerciseStats['delta30'] {
  const points = chartData
    .map(r => ({ date: r.date, value: isBodyweightOnly ? r.topReps : r.topWeight }))
    .filter((p): p is { date: string; value: number } => p.value !== null)
  if (points.length < 2) return null

  const latest = points[points.length - 1]!
  const latestMs = Date.parse(latest.date)
  const eligible = points.filter(p => latestMs - Date.parse(p.date) >= 30 * DAY_MS)
  const baseline = eligible.length ? eligible[eligible.length - 1]! : points[0]!

  return {
    value: latest.value - baseline.value,
    unit: isBodyweightOnly ? 'reps' : 'kg',
  }
}

export function computeExerciseStats(
  sets: StatSetRow[],
  dateBySession: Map<string, string>,
): ExerciseStats {
  if (sets.length === 0) {
    return {
      heaviestSet: null,
      bestOneRM: null,
      isBodyweightOnly: false,
      sessionCount: 0,
      lastTrainedDate: null,
      delta30: null,
      chartData: [],
    }
  }

  const weighted = sets.filter(s => !s.is_bodyweight)
  const isBodyweightOnly = weighted.length === 0

  // Heaviest set: prefer heaviest weighted; fall back to highest-rep bodyweight
  const heaviest = weighted.length
    ? weighted.reduce((best, s) => s.weight_kg > best.weight_kg ? s : best, weighted[0]!)
    : sets.reduce((best, s) => s.reps > best.reps ? s : best, sets[0]!)

  // Best 1RM using Epley — weighted sub-maximal efforts only (2–10 reps)
  const bestOneRM = weighted
    .filter(s => s.reps >= 2 && s.reps <= 10)
    .reduce<number | null>((best, s) => {
      const orm = epley(s)
      return best === null || orm > best ? orm : best
    }, null)

  const byDate = new Map<string, StatSetRow[]>()
  for (const s of sets) {
    const date = dateBySession.get(s.session_id)
    if (!date) continue
    const group = byDate.get(date)
    if (group) group.push(s)
    else byDate.set(date, [s])
  }

  const chartData: ExerciseChartPoint[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const w = group.filter(s => !s.is_bodyweight)
      const eligible = w.filter(s => s.reps >= 2 && s.reps <= 10)
      return {
        date,
        topWeight: w.length ? Math.max(...w.map(s => s.weight_kg)) : null,
        e1rm: eligible.length
          ? Math.round(Math.max(...eligible.map(epley)) * 10) / 10
          : null,
        volume: w.length ? w.reduce((sum, s) => sum + s.weight_kg * s.reps, 0) : null,
        topReps: Math.max(...group.map(s => s.reps)),
      }
    })

  return {
    heaviestSet: {
      weight_kg: heaviest.weight_kg,
      reps: heaviest.reps,
      is_bodyweight: heaviest.is_bodyweight,
    },
    bestOneRM,
    isBodyweightOnly,
    sessionCount: chartData.length,
    lastTrainedDate: chartData.length ? chartData[chartData.length - 1]!.date : null,
    delta30: computeDelta30(chartData, isBodyweightOnly),
    chartData,
  }
}
