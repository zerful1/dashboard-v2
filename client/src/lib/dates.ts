/**
 * "Mon 22 Sep" for a YYYY-MM-DD. Built as a LOCAL date: new Date('2026-08-16')
 * parses as UTC and renders the previous day for anyone west of it. Was
 * duplicated in DateSelector and Home's old last-session card; now the copy
 * sheet needs it too.
 */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Monday 6 Oct" for a YYYY-MM-DD, built as a LOCAL date like prettyDate. Home's header. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

/** "Tue 30 Sep", or "Mon 3 Nov 2025" outside today's year: History's rows and sheet title. */
export function listDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  if (iso.slice(0, 4) !== today.slice(0, 4)) opts.year = "numeric";
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, opts);
}

/** "2 Oct", or "2 Mar 2025" outside today's year: a date in a list (redesign part 3b). */
export function shortDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const opts: Intl.DateTimeFormatOptions =
    iso.slice(0, 4) === today.slice(0, 4) ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, opts);
}
