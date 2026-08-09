import { describe, it, expect } from 'vitest'
import { linearTrend, trendPoint } from '../src/domain/trend'

describe('linearTrend', () => {
  it('returns slope 0 and y-value for a single point', () => {
    const result = linearTrend([{ x: 0, y: 80 }])
    expect(result.slope).toBe(0)
    expect(result.intercept).toBe(80)
  })

  it('returns correct slope for a perfectly linear descending series', () => {
    const points = [
      { x: 0, y: 80 },
      { x: 1, y: 79 },
      { x: 2, y: 78 },
      { x: 3, y: 77 },
    ]
    const result = linearTrend(points)
    expect(result.slope).toBeCloseTo(-1)
    expect(result.intercept).toBeCloseTo(80)
  })

  it('returns slope 0 for flat data', () => {
    const points = [{ x: 0, y: 75 }, { x: 1, y: 75 }, { x: 2, y: 75 }]
    expect(linearTrend(points).slope).toBeCloseTo(0)
  })
})

describe('trendPoint', () => {
  it('calculates y at a given x', () => {
    expect(trendPoint(5, { slope: -1, intercept: 80 })).toBe(75)
  })
})
