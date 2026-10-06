export interface TrendLine {
  slope: number
  intercept: number
}

export function linearTrend(points: { x: number; y: number }[]): TrendLine {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0 }
  }
  const n = points.length
  const sumX  = points.reduce((a, p) => a + p.x, 0)
  const sumY  = points.reduce((a, p) => a + p.y, 0)
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0)
  const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export function trendPoint(x: number, trend: TrendLine): number {
  return trend.slope * x + trend.intercept
}

/**
 * Whether a weight change moved toward the goal, for colouring it (redesign
 * spec §5.8). Green means progress whatever the phase: down on a cut, up on a
 * bulk. With no goal there is nothing to measure against, so it is neutral,
 * and a weight is never shown as bad: it only ever earns green or nothing.
 */
export function trendTone(previousKg: number, latestKg: number, goalKg: number | null): 'good' | 'neutral' {
  if (goalKg === null) return 'neutral'
  return Math.abs(goalKg - latestKg) < Math.abs(goalKg - previousKg) ? 'good' : 'neutral'
}
