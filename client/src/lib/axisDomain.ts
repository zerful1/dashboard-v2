/** A chart's Y axis: whole numbers just outside the data (fixed padding gave decimal ticks the margin clipped). */
export function axisDomain(values: number[]): [number, number] {
  const lo = Math.floor(Math.min(...values));
  const hi = Math.ceil(Math.max(...values));
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}
