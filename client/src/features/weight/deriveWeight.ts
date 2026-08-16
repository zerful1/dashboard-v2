import { linearTrend, trendPoint, calcWeightStreak, shiftISO } from "@dashboard/shared";
import type { BodyWeightEntry } from "@dashboard/shared";
import type { ChartPoint } from "./WeightChart";

export interface WeightSummary {
  latest: number | null;
  latestDate: string | null;
  deltaWeek: number | null;
  deltaMonth: number | null;
  lowest: number | null;
  streak: number;
  points: ChartPoint[];
  trend: ChartPoint[];
}

/**
 * Every figure the weight page shows, derived in one pure pass.
 *
 * `today` is an argument, never inferred: a calendar day is asserted by the
 * caller. That also means the tests need no fake timers and this function
 * cannot read the process clock, so a run at 23:59 behaves like a run at noon.
 *
 * `entries` arrive newest-first from the API.
 */
export function deriveWeightSummary(
  entries: BodyWeightEntry[],
  today: string,
): WeightSummary {
  if (entries.length === 0) {
    return {
      latest: null,
      latestDate: null,
      deltaWeek: null,
      deltaMonth: null,
      lowest: null,
      streak: 0,
      points: [],
      trend: [],
    };
  }

  // localeCompare on YYYY-MM-DD sorts chronologically because the format is
  // lexicographically ordered — no Date needed, which is the point.
  const ascending = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latestEntry = ascending[ascending.length - 1]!;

  // Compare against the most recent entry on or before the cutoff, not an exact
  // date match — weigh-ins are not daily, so an exact lookup mostly misses and
  // would report "no change" for someone who simply skipped that day.
  const at = (cutoff: string): number | null => {
    for (let i = ascending.length - 1; i >= 0; i--) {
      if (ascending[i]!.date <= cutoff) return ascending[i]!.weight_kg;
    }
    return null;
  };

  const weekAgo = at(shiftISO(today, -7));
  const monthAgo = at(shiftISO(today, -30));

  const points: ChartPoint[] = ascending.map((e) => ({ date: e.date, kg: e.weight_kg }));

  // linearTrend takes {x, y} pairs and trendPoint takes (x, line) — index as x,
  // so the fit is over position rather than elapsed days. Uneven gaps therefore
  // weight every weigh-in equally, which is what the chart draws.
  const line = linearTrend(points.map((p, i) => ({ x: i, y: p.kg })));

  return {
    latest: latestEntry.weight_kg,
    latestDate: latestEntry.date,
    deltaWeek: weekAgo === null ? null : round1(latestEntry.weight_kg - weekAgo),
    deltaMonth: monthAgo === null ? null : round1(latestEntry.weight_kg - monthAgo),
    lowest: Math.min(...points.map((p) => p.kg)),
    streak: calcWeightStreak(entries, today),
    points,
    // Two endpoints are enough to draw a straight line, and keep the overlay
    // from being mistaken for data.
    trend:
      points.length < 2
        ? []
        : [
            { date: points[0]!.date, kg: trendPoint(0, line) },
            { date: points[points.length - 1]!.date, kg: trendPoint(points.length - 1, line) },
          ],
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
