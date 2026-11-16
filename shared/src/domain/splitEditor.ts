// Pure reducers for the split editor: each returns a NEW SplitConfig, never mutating its input.
import type { SplitConfig, DayType } from './splitRotation'

// New day_type is max(existing) + 1; reusing a removed number is fine since history is snapshotted by name.
export function addDay(config: SplitConfig, label = 'New day'): SplitConfig {
  const nextType = config.days.reduce((m, d) => Math.max(m, d.day_type), 0) + 1
  return { ...config, days: [...config.days, { day_type: nextType, label }] }
}

// Weekdays pointing at the day reset to 'rest'; its `exercises` rows stay, so removal is reversible.
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

export function setWeekSlot(config: SplitConfig, weekdayIdx: number, slot: DayType): SplitConfig {
  return {
    ...config,
    week: config.week.map((s, i) => (i === weekdayIdx ? slot : s)),
  }
}
