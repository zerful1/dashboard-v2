import { describe, it, expect } from 'vitest'
import { computeExerciseStats, type StatSetRow } from '../src/domain/workoutStats'

function set(
  session_id: string, weight_kg: number, reps: number, is_bodyweight = false,
): StatSetRow {
  return { session_id, weight_kg, reps, is_bodyweight }
}

function dates(entries: Record<string, string>) {
  return new Map(Object.entries(entries))
}

describe('computeExerciseStats', () => {
  it('returns empty stats for no sets', () => {
    const stats = computeExerciseStats([], new Map())
    expect(stats.heaviestSet).toBeNull()
    expect(stats.bestOneRM).toBeNull()
    expect(stats.chartData).toEqual([])
    expect(stats.sessionCount).toBe(0)
    expect(stats.lastTrainedDate).toBeNull()
    expect(stats.delta30).toBeNull()
    expect(stats.isBodyweightOnly).toBe(false)
  })

  it('heaviest set prefers the heaviest weighted set', () => {
    const stats = computeExerciseStats(
      [set('a', 80, 8), set('a', 90, 3), set('a', 0, 15, true)],
      dates({ a: '2026-01-01' }),
    )
    expect(stats.heaviestSet).toEqual({ weight_kg: 90, reps: 3, is_bodyweight: false })
  })

  it('heaviest set falls back to highest-rep bodyweight set', () => {
    const stats = computeExerciseStats(
      [set('a', 0, 10, true), set('a', 0, 14, true)],
      dates({ a: '2026-01-01' }),
    )
    expect(stats.heaviestSet).toEqual({ weight_kg: 0, reps: 14, is_bodyweight: true })
  })

  it('best 1RM uses Epley over weighted 2-10 rep sets only', () => {
    const stats = computeExerciseStats(
      [
        set('a', 100, 1),      // excluded: 1 rep
        set('a', 80, 8),       // 80 * (1 + 8/30) = 101.33…
        set('a', 90, 11),      // excluded: > 10 reps
        set('a', 0, 10, true), // excluded: bodyweight
      ],
      dates({ a: '2026-01-01' }),
    )
    expect(stats.bestOneRM).toBeCloseTo(80 * (1 + 8 / 30), 5)
  })

  it('builds one chart row per session date with null gaps per metric', () => {
    const stats = computeExerciseStats(
      [
        set('a', 80, 8),
        set('a', 0, 10, true),
        set('b', 0, 12, true), // bodyweight-only session
      ],
      dates({ a: '2026-01-01', b: '2026-01-05' }),
    )
    expect(stats.chartData).toEqual([
      { date: '2026-01-01', topWeight: 80, e1rm: 101.3, volume: 640, topReps: 10 },
      { date: '2026-01-05', topWeight: null, e1rm: null, volume: null, topReps: 12 },
    ])
  })

  it('sums volume over all weighted sets of a session', () => {
    const stats = computeExerciseStats(
      [set('a', 80, 8), set('a', 75, 10)],
      dates({ a: '2026-01-01' }),
    )
    expect(stats.chartData[0]?.volume).toBe(80 * 8 + 75 * 10)
  })

  it('sorts chart rows by date ascending and skips sets without a session date', () => {
    const stats = computeExerciseStats(
      [set('b', 90, 5), set('a', 80, 5), set('orphan', 100, 5)],
      dates({ a: '2026-01-01', b: '2026-02-01' }),
    )
    expect(stats.chartData.map(r => r.date)).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('counts distinct training dates and reports the last one', () => {
    const stats = computeExerciseStats(
      [set('a', 80, 5), set('b', 85, 5), set('c', 90, 5)],
      dates({ a: '2026-01-01', b: '2026-01-08', c: '2026-01-15' }),
    )
    expect(stats.sessionCount).toBe(3)
    expect(stats.lastTrainedDate).toBe('2026-01-15')
  })

  it('flags bodyweight-only exercises', () => {
    const stats = computeExerciseStats(
      [set('a', 0, 10, true)],
      dates({ a: '2026-01-01' }),
    )
    expect(stats.isBodyweightOnly).toBe(true)
  })

  describe('delta30', () => {
    it('is null with fewer than two sessions', () => {
      const stats = computeExerciseStats([set('a', 80, 5)], dates({ a: '2026-01-01' }))
      expect(stats.delta30).toBeNull()
    })

    it('compares latest top set against the most recent session ≥30 days earlier', () => {
      const stats = computeExerciseStats(
        [set('a', 80, 5), set('b', 85, 5), set('c', 90, 5)],
        // b is only 26 days before c — not an eligible baseline; a (45 days) is.
        dates({ a: '2026-01-01', b: '2026-01-20', c: '2026-02-15' }),
      )
      expect(stats.delta30).toEqual({ value: 10, unit: 'kg' })
    })

    it('falls back to the earliest session when all are within 30 days', () => {
      const stats = computeExerciseStats(
        [set('a', 80, 5), set('b', 90, 5)],
        dates({ a: '2026-02-01', b: '2026-02-15' }),
      )
      expect(stats.delta30).toEqual({ value: 10, unit: 'kg' })
    })

    it('can be negative', () => {
      const stats = computeExerciseStats(
        [set('a', 90, 5), set('b', 85, 5)],
        dates({ a: '2026-01-01', b: '2026-02-15' }),
      )
      expect(stats.delta30).toEqual({ value: -5, unit: 'kg' })
    })

    it('uses top reps for bodyweight-only exercises', () => {
      const stats = computeExerciseStats(
        [set('a', 0, 8, true), set('b', 0, 12, true)],
        dates({ a: '2026-01-01', b: '2026-02-15' }),
      )
      expect(stats.delta30).toEqual({ value: 4, unit: 'reps' })
    })
  })
})
