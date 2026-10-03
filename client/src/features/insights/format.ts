import { mondayOf, shiftISO } from "@dashboard/shared";

// Fixed names, not toLocaleDateString: en-GB's short September is "Sept" on
// newer ICU and "Sep" on older, and the label must not depend on the device.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Read straight off the string: no Date, so no timezone can shift the day.
const day = (iso: string) => String(Number(iso.slice(8, 10)));
const month = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1]!;

/** "21–27 Sep", or "28 Sep – 4 Oct" when the week spans two months. */
export function weekLabel(monday: string): string {
  const sunday = shiftISO(monday, 6);
  return month(monday) === month(sunday)
    ? `${day(monday)}–${day(sunday)} ${month(sunday)}`
    : `${day(monday)} ${month(monday)} – ${day(sunday)} ${month(sunday)}`;
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

/** "+6%", or null when there is no earlier value to compare with. */
export function percentChange(current: number, previous: number): string | null {
  if (!previous) return null;
  return `${signed(((current - previous) / previous) * 100, 0)}%`;
}

/** "9 Nov". */
export function dayMonth(iso: string): string {
  return `${day(iso)} ${month(iso)}`;
}
