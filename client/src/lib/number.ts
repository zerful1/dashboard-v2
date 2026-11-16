/** A number typed into a field, or null; comma decimals ("1,5") are 1.5, never NaN. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
