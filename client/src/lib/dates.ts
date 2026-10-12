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

// Fixed English names, not the locale's: en-GB's short September is "Sept",
// and a screen reader's label should not change with the device.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A local Date only to read the weekday off it (CLAUDE.md: dates are strings). */
function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(y!, m! - 1, d!).getDay()]!;
}

/** "24–30 Sep", "28 Sep – 4 Oct", "29 Dec 2025 – 4 Jan": a span of days, with the year only outside today's. */
export function rangeLabel(from: string, to: string, today: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const year = (y: number) => (y === Number(today.slice(0, 4)) ? "" : ` ${y}`);
  if (fy !== ty) return `${fd} ${MONTHS[fm! - 1]} ${fy} – ${td} ${MONTHS[tm! - 1]}${year(ty!)}`;
  if (fm !== tm) return `${fd} ${MONTHS[fm! - 1]} – ${td} ${MONTHS[tm! - 1]}${year(ty!)}`;
  return `${fd}–${td} ${MONTHS[tm! - 1]}${year(ty!)}`;
}

/** "Tuesday 6 October": a date for a screen reader. */
export function spokenDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${weekday(iso)} ${d} ${MONTHS_LONG[m! - 1]}`;
}

/** "T": a weekday's initial, over a column. */
export function weekdayInitial(iso: string): string {
  return weekday(iso)[0]!;
}

/** "October", or "Sep 2025" outside today's year: a month in Weight's list (redesign part 5). */
export function monthLabel(iso: string, today: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return iso.slice(0, 4) === today.slice(0, 4) ? MONTHS_LONG[m]! : `${MONTHS[m]} ${iso.slice(0, 4)}`;
}

/** "Feb – Apr", or "Nov 2025 – Feb 2026" when either end is outside today's year; one month is monthLabel. */
export function monthRangeLabel(from: string, to: string, today: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return monthLabel(from, today);
  const year = today.slice(0, 4);
  const withYear = from.slice(0, 4) !== year || to.slice(0, 4) !== year;
  const name = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}${withYear ? ` ${iso.slice(0, 4)}` : ""}`;
  return `${name(from)} – ${name(to)}`;
}

/** "Oct", with January carrying its year ("Jan 2026"): a month tick on a time axis. */
export function monthTick(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return m === 0 ? `Jan ${iso.slice(0, 4)}` : MONTHS[m]!;
}
