export function toLocalISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The current calendar day in an explicit IANA timezone, as YYYY-MM-DD.
 *
 * Server code must never infer the day from the process timezone — on a deployed
 * host that is UTC for every user, regardless of where they actually are. Pass the
 * user's `profiles.timezone`.
 *
 * Client code should not normally need this: the browser already runs in the user's
 * timezone, so `toLocalISO()` is correct there. This exists for server-initiated
 * work (scheduled email, "is the streak still alive right now" checks).
 *
 * 'en-CA' is used because it formats as YYYY-MM-DD natively. Node 20+ ships full
 * ICU, so named timezones resolve without extra data.
 */
export function todayISO(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Shift a YYYY-MM-DD string by whole days. Pure calendar arithmetic — no timezone
 * and no clock involved, so DST transitions are simply not a special case.
 *
 * `Date.UTC` and `toISOString` are safe here specifically because the Date is built
 * in UTC and only ever used as a calendar cursor; there is no local time to misalign.
 */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Whole days from `from` to `to`, negative when `to` is earlier. The same UTC
 * calendar cursor as shiftISO, so a clock change is not a special case.
 */
export function daysBetweenISO(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
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

/** A YYYY-MM-DD that names a day that exists: no 30 February, no month 13. */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d
}

/** A real date that falls on a Monday: how a Monday-to-Sunday week is named. */
export function isMonday(iso: string): boolean {
  if (!isRealDate(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() === 1
}

/** The Monday of the week holding `iso`. The same UTC calendar cursor as shiftISO. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() // 0 = Sunday
  return shiftISO(iso, -((weekday + 6) % 7))
}
