import { describe, it, expect } from 'vitest'
import { recordEvents, type RecordSetRow } from '../src/domain/insights/records'

const row = (date: string, exercise_name: string, weight_kg: number, reps: number, is_bodyweight = false): RecordSetRow =>
  ({ date, exercise_name, weight_kg, reps, is_bodyweight })

describe('recordEvents', () => {
  it('lets the first session set the baseline quietly', () => {
    expect(recordEvents([row('2026-09-01', 'Lat Pulldown', 60, 8)])).toEqual([])
  })

  it('raises one event when a session beats the heaviest and the e1RM', () => {
    const events = recordEvents([
      row('2026-09-01', 'Lat Pulldown', 60, 8),
      row('2026-09-08', 'Lat Pulldown', 66, 8),
    ])
    // Epley: 60 x (1 + 8/30) = 76.0; 66 x (1 + 8/30) = 83.6, shown and compared at 83.5.
    expect(events).toEqual([{
      date: '2026-09-08', exercise_name: 'Lat Pulldown',
      heaviest: { weightKg: 66, reps: 8, previousKg: 60 },
      e1rm: { valueKg: 83.5, previousKg: 76 },
    }])
  })

  it('raises nothing for a tie', () => {
    expect(recordEvents([row('2026-09-01', 'Squat', 100, 5), row('2026-09-08', 'Squat', 100, 5)])).toEqual([])
  })

  it('counts e1RM only on sets of 2 to 10 reps', () => {
    const events = recordEvents([
      row('2026-09-01', 'Bench Press', 60, 5),
      row('2026-09-08', 'Bench Press', 50, 20), // e1RM 83.3 by Epley, but 20 reps is outside the range
    ])
    expect(events).toEqual([])
  })

  it('gives bodyweight sets reps records only', () => {
    const events = recordEvents([row('2026-09-01', 'Pull Ups', 0, 5, true), row('2026-09-16', 'Pull Ups', 0, 6, true)])
    expect(events).toEqual([{ date: '2026-09-16', exercise_name: 'Pull Ups', reps: { reps: 6, previous: 5 } }])
  })

  // Review focus 2: bodyweight for months, then a first weighted set.
  it("treats each measure's first appearance as its baseline", () => {
    const events = recordEvents([
      row('2026-05-05', '45 Extension', 0, 15, true),
      row('2026-08-03', '45 Extension', 5, 12),
    ])
    expect(events).toEqual([])
  })

  it('treats two sessions on one date as one, and lists newest first', () => {
    const events = recordEvents([
      row('2026-09-01', 'Curl', 10, 8),
      row('2026-09-08', 'Curl', 12, 8), row('2026-09-08', 'Curl', 14, 6),
      row('2026-09-01', 'Row', 50, 8), row('2026-09-15', 'Row', 55, 8),
    ])
    expect(events.map((e) => `${e.date} ${e.exercise_name} ${e.heaviest?.weightKg}`)).toEqual([
      '2026-09-15 Row 55', '2026-09-08 Curl 14',
    ])
  })
})
