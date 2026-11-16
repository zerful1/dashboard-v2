import { rollingAverage, shiftISO, trendFit, windowMean } from "@dashboard/shared";
import type { AveragePoint, BodyWeightEntry, PeriodKind, TrendFit } from "@dashboard/shared";
import type { ChartPoint } from "./WeightChart";
import { axisDomain } from "@/lib/axisDomain";

export interface WeightSummary {
  latest: number | null;
  latestDate: string | null;
  /** The mean of the weigh-ins in the 7 days ending today; null with none. */
  average7: number | null;
  /** Insights' fit over the last 56 days (trendFit): the one rate, with or without a goal. */
  fit: TrendFit;
  /** Every weigh-in, oldest first. */
  points: ChartPoint[];
  /** The trailing 7-day average at each weigh-in, oldest first. */
  line: AveragePoint[];
}

/** Every figure the Weight page and Home's weight section show, in one pure pass; `today` is passed in. */
export function deriveWeightSummary(entries: BodyWeightEntry[], today: string): WeightSummary {
  // localeCompare on YYYY-MM-DD sorts chronologically, so no Date is needed.
  const points: ChartPoint[] = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ date: e.date, kg: e.weight_kg }));
  const latest = points[points.length - 1] ?? null;
  return {
    latest: latest?.kg ?? null,
    latestDate: latest?.date ?? null,
    average7: windowMean(points, shiftISO(today, -6), today),
    fit: trendFit("weight", points.map((p) => ({ date: p.date, value: p.kg })), today),
    points,
    line: rollingAverage(points),
  };
}

/** Where the goal sits in the chart's y-range; only one inside it is drawn (stretching squashed the line). */
export function goalPlacement(
  points: ChartPoint[],
  line: ChartPoint[],
  goalKg: number | null,
): "in" | "below" | "above" | null {
  if (goalKg === null || points.length === 0) return null;
  const [lo, hi] = axisDomain([...points, ...line].map((p) => p.kg));
  if (goalKg < lo) return "below";
  if (goalKg > hi) return "above";
  return "in";
}

export type RangeId = "1M" | "3M" | "6M" | "1Y" | "All";

export interface RangeSpec {
  id: RangeId;
  /** Days back from today; null for All, which starts at the first weigh-in. */
  days: number | null;
  /** Weeks for 1M and 3M, months beyond. */
  period: PeriodKind;
  /** For the chart's label: "Weight over 3 months". */
  span: string;
}

export const RANGES: readonly RangeSpec[] = [
  { id: "1M", days: 30, period: "week", span: "1 month" },
  { id: "3M", days: 91, period: "week", span: "3 months" },
  { id: "6M", days: 182, period: "month", span: "6 months" },
  { id: "1Y", days: 365, period: "month", span: "1 year" },
  { id: "All", days: null, period: "month", span: "all time" },
];

/** The range's first day: `today - days`, or the first weigh-in for All. */
export function rangeStart(range: RangeSpec, today: string, first: string): string {
  return range.days === null ? first : shiftISO(today, -range.days);
}
