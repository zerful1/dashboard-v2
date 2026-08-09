// The workout split: which training days exist, their labels, and which weekday
// (Mon–Sun) each runs on. Editable from the dashboard — the live config is stored
// per-user in the `workout_split` table and read via the `useSplit` hook. Until a
// user customises it, everything resolves to DEFAULT_SPLIT, so behaviour is
// identical to the old hardcoded split.
//
// Historical sessions are NOT labeled from this module — every workout_sessions
// row snapshots its own `day_name` at log time (getDayName), so old sessions keep
// their original names forever even after the split changes. History filter chips
// merge the current labels with whatever names actually exist in the DB
// (historyFilterNames) rather than a hardcoded legacy list.

// A training day's stable id. day_type is a free integer used as the key on the
// `exercises` template and `workout_sessions` rows; 'rest' only ever appears in a
// week slot or as getTodayDayType's "no workout today" result.
export type DayType = number | 'rest'

export interface SplitDay {
  day_type: number
  label: string
}

export interface SplitConfig {
  // Ordered training days: defines which day_types exist, their labels, and the
  // DaySelector / History-chip order.
  days: SplitDay[]
  // Length 7, index 0 = Monday … 6 = Sunday. Each slot is a day_type or 'rest'.
  week: DayType[]
}

// PPL R UL R, Monday-anchored. Day-type numbers keep the original-era assignment
// (1=Legs … 5=Upper) so seeded `exercises` rows and pre-existing sessions stay
// aligned; `days` order matches the legacy DaySelector order (1→5) so nothing
// visibly changes until a user customises their split.
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

// Weekday index with Monday = 0 … Sunday = 6. JS Date.getDay() is Sunday = 0, so
// we rotate by 6 to put Monday first.
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

// Today's day_type per the split's weekly rotation. Returns a day_type (number) on
// a training weekday, or 'rest' on a rest weekday. A rest weekday is already 'rest'
// in `week`, so the slot is returned as-is; the `?? 'rest'` only guards a malformed
// (short) week array, treating anything unexpected as a rest day.
export function getTodayDayType(split: SplitConfig, today: Date = new Date()): DayType {
  return split.week[mondayIndex(today)] ?? 'rest'
}

// The display name for a day_type in the given split. Falls back to 'Workout' for
// an unknown day_type (mirrors the old `CURRENT_SPLIT[dt] ?? 'Workout'`), so a
// session insert always has a sensible day_name to snapshot.
export function getDayName(split: SplitConfig, dayType: number): string {
  return split.days.find(d => d.day_type === dayType)?.label ?? 'Workout'
}

// Names for the History filter chips: current split labels first (in order), then
// any distinct historical day_names not already covered. Replaces the hardcoded
// LEGACY_DAY_NAMES — retired split names now surface straight from the DB. A name
// shared across splits (e.g. an old and current "Lower") yields a single chip.
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
