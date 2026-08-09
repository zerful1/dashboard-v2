export function toLocalISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Day of the calendar year, 1-based (Jan 1 = 1). */
export function getDayOfYear(d: Date = new Date()): number {
  const year = d.getFullYear()
  const month = d.getMonth()
  const date = d.getDate()

  let dayCount = 0
  for (let m = 0; m < month; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    dayCount += daysInMonth
  }
  dayCount += date

  return dayCount
}

/** Week of the calendar year, 1-based — ceil(dayOfYear / 7). Matches the prototype's "WK" badge. */
export function getWeekOfYear(d: Date = new Date()): number {
  return Math.ceil(getDayOfYear(d) / 7)
}

/** Number of days in the calendar year of `d` (365 or 366). */
export function getDaysInYear(d: Date = new Date()): number {
  return getDayOfYear(new Date(d.getFullYear(), 11, 31))
}
