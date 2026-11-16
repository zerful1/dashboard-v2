export function toLocalISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today in an IANA timezone: a deployed server is UTC for everyone, so pass `profiles.timezone`. */
export function todayISO(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Shift a YYYY-MM-DD by whole days: UTC calendar arithmetic, so DST is no special case. */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`, negative when `to` is earlier; the UTC cursor of shiftISO. */
export function daysBetweenISO(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
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
