// Pure reducers for the split editor (SplitEditorSheet). Each takes a SplitConfig
// and returns a NEW one — none mutate their input — so the editor can keep an
// immutable working copy in React state and these stay trivially unit-testable.
import type { SplitConfig, DayType } from './splitRotation'

// Add a training day. The new day_type is allocated as max(existing) + 1 so it
// never collides with a day that's currently in the split. (Exercises and history
// are keyed by day_type; a removed-then-re-added type can reuse a number, which is
// acceptable — history is snapshotted by name, not day_type.)
export function addDay(config: SplitConfig, label = 'New day'): SplitConfig {
  const nextType = config.days.reduce((m, d) => Math.max(m, d.day_type), 0) + 1
  return { ...config, days: [...config.days, { day_type: nextType, label }] }
}

// Remove a training day, and reset any weekday pointing at it back to 'rest'.
// Leaves the day's `exercises` rows untouched (removal is reversible — re-adding a
// day with the same number re-exposes them).
export function removeDay(config: SplitConfig, dayType: number): SplitConfig {
  return {
    days: config.days.filter(d => d.day_type !== dayType),
    week: config.week.map(slot => (slot === dayType ? 'rest' : slot)),
  }
}

export function renameDay(config: SplitConfig, dayType: number, label: string): SplitConfig {
  return {
    ...config,
    days: config.days.map(d => (d.day_type === dayType ? { ...d, label } : d)),
  }
}

// Assign a weekday slot (0 = Monday … 6 = Sunday) to a day_type or 'rest'.
export function setWeekSlot(config: SplitConfig, weekdayIdx: number, slot: DayType): SplitConfig {
  return {
    ...config,
    week: config.week.map((s, i) => (i === weekdayIdx ? slot : s)),
  }
}
