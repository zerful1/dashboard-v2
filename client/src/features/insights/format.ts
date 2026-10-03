import { mondayOf, shiftISO } from "@dashboard/shared";

// Fixed names, not toLocaleDateString: en-GB's short September is "Sept" on
// newer ICU and "Sep" on older, and the label must not depend on the device.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Read straight off the string: no Date, so no timezone can shift the day.
const day = (iso: string) => String(Number(iso.slice(8, 10)));
const month = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1]!;

// The year only when it is not this one: records reach back into last year,
// and "30 Sep" alone would pass a 2025 record off as this year's.
const year = (iso: string, today: string) => (iso.slice(0, 4) === today.slice(0, 4) ? "" : ` ${iso.slice(0, 4)}`);

/** "21–27 Sep", "28 Sep – 4 Oct" across months, "22–28 Sep 2025" in another year. */
export function weekLabel(monday: string, today: string): string {
  const sunday = shiftISO(monday, 6);
  const label =
    month(monday) === month(sunday)
      ? `${day(monday)}–${day(sunday)} ${month(sunday)}`
      : `${day(monday)} ${month(monday)} – ${day(sunday)} ${month(sunday)}`;
  return label + year(sunday, today);
}

/** The Monday of the week before the one holding `today`. */
export function lastFullWeek(today: string): string {
  return shiftISO(mondayOf(today), -7);
}

/** "+0.8", "−0.4" (a real minus sign), "0.0". */
export function signed(n: number, digits: number): string {
  const text = Math.abs(n).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${n > 0 ? "+" : "−"}${text}`;
}

/** "+6%", or null when either week is 0 (spec section 4): nothing to compare. */
export function percentChange(current: number, previous: number): string | null {
  if (!previous || !current) return null;
  return `${signed(((current - previous) / previous) * 100, 0)}%`;
}

/** "9 Nov", or "30 Sep 2025" outside the current year. */
export function dayMonth(iso: string, today: string): string {
  return `${day(iso)} ${month(iso)}${year(iso, today)}`;
}
