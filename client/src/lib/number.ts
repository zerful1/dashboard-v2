/**
 * A number typed into a field, or null. iPhone keypads in comma-decimal
 * regions type "1,5"; that is 1.5, not an error and never NaN.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
