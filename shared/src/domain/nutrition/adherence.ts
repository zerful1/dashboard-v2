/**
 * Sum the kcal in `entries` and divide by `days` (NOT by days-with-data).
 *
 * Honest-adherence rationale: dividing by days-with-data hides skipped days,
 * which is exactly the failure mode we don't want to flatter. A user who logged
 * 2000 kcal on 4 of 7 days has averaged 1143 kcal/day, not 2000 kcal/day.
 */
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
