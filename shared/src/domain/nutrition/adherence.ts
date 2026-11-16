/** Kcal over `days`, NOT days-with-data, which would hide skipped days. */
export function averageDailyIntake(
  entries: { date: string; calories: number }[],
  days: number,
): number {
  if (days <= 0) return 0
  const total = entries.reduce((s, e) => s + Number(e.calories), 0)
  return Math.round(total / days)
}

export function distinctLoggedDates(entries: { date: string }[]): string[] {
  return [...new Set(entries.map(e => e.date))].sort()
}
