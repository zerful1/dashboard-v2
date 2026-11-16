// Historical sessions are never labelled from here: each snapshots its own `day_name` at log time.

// day_type is a free integer keying `exercises` and `workout_sessions`; 'rest' only fills a week slot.
export type DayType = number | 'rest'

export interface SplitDay {
  day_type: number
  label: string
}

export interface SplitConfig {
  // Ordered training days: the day_types that exist, their labels, and the selector/chip order.
  days: SplitDay[]
  // Length 7, Monday first; each slot is a day_type or 'rest'.
  week: DayType[]
}

// Day-type numbers keep the original-era assignment so seeded `exercises` rows and old sessions stay aligned.
export const DEFAULT_SPLIT: SplitConfig = {
  days: [
    { day_type: 1, label: 'Legs' },
    { day_type: 2, label: 'Pull' },
    { day_type: 3, label: 'Push' },
    { day_type: 4, label: 'Lower' },
    { day_type: 5, label: 'Upper' },
  ],
  week: [3, 2, 1, 'rest', 5, 4, 'rest'], // Mon … Sun
}

// Monday = 0 … Sunday = 6; Date.getDay() starts at Sunday, so rotate by 6.
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

// The `?? 'rest'` only guards a malformed (short) week array.
export function getTodayDayType(split: SplitConfig, today: Date = new Date()): DayType {
  return split.week[mondayIndex(today)] ?? 'rest'
}

// Falls back to 'Workout' so a session insert always has a day_name to snapshot.
export function getDayName(split: SplitConfig, dayType: number): string {
  return split.days.find(d => d.day_type === dayType)?.label ?? 'Workout'
}

// History chips: current labels first, then historical day_names not already covered (one chip per name).
export function historyFilterNames(
  currentLabels: string[],
  historicalNames: string[],
): string[] {
  const result = [...currentLabels]
  const seen = new Set(currentLabels)
  for (const name of historicalNames) {
    if (!seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}
