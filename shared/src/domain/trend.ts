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
