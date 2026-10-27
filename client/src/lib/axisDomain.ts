/**
 * A chart's Y axis: the whole numbers just outside the data, and a unit either
 * side of a flat line. It once padded a kilogram or two beyond that, so a 2 kg
 * change filled a third of the chart's height. Whole numbers because a fixed
 * "dataMin - 2" gave decimal ticks such as 128.7, whose leading digit the
 * margin clipped.
 */
export function axisDomain(values: number[]): [number, number] {
  const lo = Math.floor(Math.min(...values));
  const hi = Math.ceil(Math.max(...values));
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}
