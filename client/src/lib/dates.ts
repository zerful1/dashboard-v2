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
