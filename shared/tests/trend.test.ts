import { describe, it, expect } from 'vitest'
import { linearTrend, trendPoint, trendTone } from '../src/domain/trend'

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

describe('trendTone', () => {
  // Green means progress toward the goal, whatever the phase (redesign spec §5.8).
  it('is good for a cut moving down', () => {
    expect(trendTone(82.4, 81.8, 78)).toBe('good')
  })
  it('is neutral for a cut moving up', () => {
    expect(trendTone(81.8, 82.4, 78)).toBe('neutral')
  })
  it('is good for a bulk moving up', () => {
    expect(trendTone(70, 70.6, 75)).toBe('good')
  })
  it('is neutral for a bulk moving down', () => {
    // The mirror of the cut: losing weight is not progress when gaining is the goal.
    expect(trendTone(70.6, 70, 75)).toBe('neutral')
  })
  it('is neutral with no goal to measure against', () => {
    expect(trendTone(82.4, 81.8, null)).toBe('neutral')
  })
  it('is neutral when nothing changed', () => {
    expect(trendTone(80.5, 80.5, 78)).toBe('neutral')
  })
  it('is neutral after overshooting further from the goal', () => {
    // 0.6 above the goal, then 0.8 below it: further away, though it crossed.
    expect(trendTone(80.6, 79.2, 80)).toBe('neutral')
  })
  it('is good when crossing the goal ends closer to it', () => {
    expect(trendTone(80.6, 79.8, 80)).toBe('good')
  })
})
