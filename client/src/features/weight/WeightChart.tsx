export interface ChartPoint {
  /**
   * YYYY-MM-DD. A string end to end.
   *
   * Every one of the 58 migrated weigh-ins falls in a BST month, so a value
   * that round-trips through a JS Date shifts by a day — all of them, not
   * half. Whatever renders this chart must accept string categories on the
   * x-axis; a library demanding Date objects is disqualified.
   */
  date: string;
  kg: number;
}

interface Props {
  points: ChartPoint[];
  /** Two points — the OLS line's endpoints, from linearTrend in shared. */
  trend: ChartPoint[];
}

/**
 * THE swappable boundary.
 *
 * Nothing outside this file may import a charting library. That is what makes
 * the library choice a local decision rather than a plan-wide one, and what
 * lets a pre-release dependency be evaluated at all — if it disappoints, this
 * one file changes.
 */
export function WeightChart({ points, trend }: Props) {
  return (
    <div className="h-56 rounded-card border border-raised bg-surface p-4">
      <div className="lbl">Weight · {points.length} entries</div>
      <div className="mt-2 text-xs text-dim">
        chart pending — trend {trend[0]?.kg.toFixed(1)} to {trend[1]?.kg.toFixed(1)} kg
      </div>
    </div>
  );
}
