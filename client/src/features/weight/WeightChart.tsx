import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import { daysBetweenISO, linearTrend, nextMonthStart, shiftISO, trendPoint, type AveragePoint, type LiftChartPoint } from "@dashboard/shared";
import { useMotionSafe } from "@/lib/motion";
import { listDate, monthTick } from "@/lib/dates";
import { dayMonth } from "@/features/insights/format";
import { goalPlacement } from "./deriveWeight";

export interface ChartPoint {
  /**
   * YYYY-MM-DD. A string end to end.
   *
   * Every one of the 58 migrated weigh-ins falls in a BST month, so a value
   * that round-trips through a JS Date shifts by a day — all of them, not
   * half. The chart plots it on a day axis counted by daysBetweenISO (string
   * maths), and never constructs a Date from it, which is why it is here.
   */
  date: string;
  kg: number;
}

/** One plotted day: x is days since the range's start. A null row is where the line breaks. */
export interface WeightRow {
  x: number;
  date: string;
  kg: number | null;
  avg: number | null;
}

/**
 * The weigh-ins on or after `start` as rows on a day axis, each with its 7-day
 * average, and a null row between two plotted weigh-ins more than 7 days apart
 * so the line breaks rather than bridging the gap (redesign part 5, §3).
 */
export function weightRows(points: ChartPoint[], line: AveragePoint[], start: string): WeightRow[] {
  const byDate = new Map(line.map((a) => [a.date, a]));
  const rows: WeightRow[] = [];
  for (const p of points) {
    if (p.date < start) continue;
    const a = byDate.get(p.date)!;
    const x = daysBetweenISO(start, p.date);
    if (a.gapBefore && rows.length > 0) rows.push({ x: x - 0.5, date: "", kg: null, avg: null });
    rows.push({ x, date: p.date, kg: p.kg, avg: a.kg });
  }
  return rows;
}

/** Every 7 days back from today for one month; otherwise the 1st of each month. */
export function weightTicks(start: string, today: string, weekly: boolean): { x: number; label: string }[] {
  const ticks: { x: number; label: string }[] = [];
  const total = daysBetweenISO(start, today);
  if (weekly) {
    for (let back = 0; back <= total; back += 7) ticks.unshift({ x: total - back, label: dayMonth(shiftISO(today, -back), today) });
    return ticks;
  }
  for (let d = start.endsWith("-01") ? start : nextMonthStart(start); d <= today; d = nextMonthStart(d)) {
    ticks.push({ x: daysBetweenISO(start, d), label: monthTick(d) });
  }
  return ticks;
}

/** Whole-number ends a kilogram beyond everything plotted (goalPlacement's ±1 kg). */
export function weightDomain(values: number[]): [number, number] {
  return [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)];
}

interface Props {
  /** Every weigh-in, oldest first. */
  points: ChartPoint[];
  /** rollingAverage(points). */
  line: AveragePoint[];
  /** The range's first day. */
  start: string;
  today: string;
  /** The weight goal, drawn dashed; null draws none. */
  goalKg: number | null;
  /** "3 months": for the chart's label. */
  span: string;
  /** Ticks every 7 days (1M) rather than monthly. */
  weekly: boolean;
}

/**
 * THE swappable boundary. Nothing outside this file imports a charting library.
 *
 * Library: Recharts 3.10.1, chosen over Bklit UI after a spike. Bklit failed two
 * of the three criteria: its Visx shell builds a `scaleTime` and coerces the x
 * value with `new Date(value)`, which is the Date round trip this whole feature
 * exists to avoid; and it injects its own oklch `--chart-*` palette keyed to a
 * `.dark` class this dark-only app does not set, so the chart would have
 * rendered light on our near-black ground. It also brought 58 files and nine
 * dependencies, several alpha-versioned, for one line chart.
 *
 * Series colours are `var(--color-*)` rather than hexes so the chart inherits
 * the app's palette. `raised` is the gridline colour and appears nowhere as
 * data, per the token rule. Since redesign part 5 the weigh-ins are grey dots
 * on a real-time axis and the 7-day average is the white line.
 */
export function WeightChart({ points, line, start, today, goalKg, span, weekly }: Props) {
  const rows = useMemo(() => weightRows(points, line, start), [points, line, start]);
  const plotted = rows.filter((r) => r.kg !== null);
  if (plotted.length === 0) {
    return <p className="py-14 text-center text-sm text-muted">No weigh-ins in this range.</p>;
  }

  const ticks = weightTicks(start, today, weekly);
  const labels = new Map(ticks.map((t) => [t.x, t.label]));
  const dots = plotted.map((r) => ({ date: r.date, kg: r.kg! }));
  const avgs = plotted.map((r) => ({ date: r.date, kg: r.avg! }));
  const goal = goalPlacement(dots, avgs, goalKg);
  const latest = points[points.length - 1]?.date;

  return (
    <div>
      {/* A goal outside the chart's range is named, not reached for: the axis
          stretching to it squashed the line flat. */}
      {(goal === "below" || goal === "above") && (
        <div className="tnum text-right text-xs text-muted">
          Goal {goalKg} kg {goal === "below" ? "↓" : "↑"}
        </div>
      )}
      <div className="mt-2 h-56" role="img" aria-label={`Weight over ${span}: ${plotted.length} weigh-ins and their 7-day average`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--color-raised)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, daysBetweenISO(start, today)]}
              ticks={ticks.map((t) => t.x)}
              tickFormatter={(x: number) => labels.get(x) ?? ""}
              // Muted, not dim: axis labels are words to read (CLAUDE.md).
              tick={LIFT_TICK}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={LIFT_TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={weightDomain([...dots.map((d) => d.kg), ...avgs.map((a) => a.kg)])}
              allowDecimals={false}
              tickFormatter={(v: number) => String(Math.round(v))}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-raised)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-edge)",
                borderRadius: "12px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "var(--color-muted)" }}
              labelFormatter={(_label, payload) => {
                const date = (payload?.[0]?.payload as WeightRow | undefined)?.date;
                return date ? listDate(date, today) : "";
              }}
              formatter={(value, name) => [`${Number(value).toFixed(1)} kg`, name === "kg" ? "Weight" : "Average"]}
            />
            {goal === "in" && (
              // Inside the data's own range, so the axis never moves for it.
              <ReferenceLine
                y={goalKg!}
                stroke="var(--color-dim)"
                strokeDasharray="3 4"
                label={{ value: `goal ${goalKg}`, position: "insideBottomRight", fill: "var(--color-muted)", fontSize: 10 }}
              />
            )}
            {/* Weigh-ins as grey dots, the latest a white ring. */}
            <Line
              type="monotone"
              dataKey="kg"
              stroke="none"
              isAnimationActive={false}
              activeDot={{ r: 4, fill: "var(--color-accent)", stroke: "none" }}
              dot={(props: unknown) => {
                const { cx, cy, index, payload } = props as { cx?: number; cy?: number; index?: number; payload?: WeightRow };
                const key = `dot-${index}`;
                if (cx == null || cy == null || payload?.kg == null) return <g key={key} />;
                return payload.date === latest ? (
                  <circle key={key} cx={cx} cy={cy} r={4} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={2} />
                ) : (
                  <circle key={key} cx={cx} cy={cy} r={2} fill="var(--color-dim)" />
                );
              }}
            />
            {/* The 7-day average: the one white line, broken at a null row. */}
            <Line
              type="monotone"
              dataKey="avg"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-dim" /> weigh-ins
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-3 border-t-2 border-text" /> 7-day average
        </span>
      </div>
    </div>
  );
}

/** The 7-day average with a null between two points more than 7 days apart, so the line breaks there. */
export function sparklineRows(line: AveragePoint[]): { date: string; kg: number | null }[] {
  return line.flatMap((p) =>
    p.gapBefore ? [{ date: `${p.date}-gap`, kg: null }, { date: p.date, kg: p.kg }] : [{ date: p.date, kg: p.kg }],
  );
}

/**
 * A sparkline, not a chart: no axes, no grid, no tooltip, no legend. It shows
 * shape only — the Weight page is where the detail lives.
 *
 * It DOES animate, where the chart above hardcodes isAnimationActive={false}.
 * Deliberate, not an oversight: the chart is the page you navigated to and is
 * already on screen when you arrive, so a redraw there is noise; the sparkline
 * enters with the Home tile and the draw is what makes it read as a trend
 * rather than a static glyph. Gated on useMotionSafe either way.
 *
 * It lives here because this file is the swappable charting boundary declared
 * at the top. Importing Recharts into the Home tile instead would give the
 * codebase a second import site and quietly retire that rule.
 *
 * Since redesign part 5 it draws the 7-day average, as the Weight chart's
 * white line does, so the white line means one thing on both screens.
 */
export function WeightSparkline({ line }: { line: AveragePoint[] }) {
  const safe = useMotionSafe();
  if (line.length < 2) return null;

  return (
    <div className="h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sparklineRows(line)}>
          {/* Without a domain Recharts pads to round numbers and a 0.4 kg move
              renders as a flat line. dataMin/dataMax uses the full height. */}
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={safe}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tick text for LiftChart: muted, because axis labels are words to read (CLAUDE.md). */
export const LIFT_TICK = { fontSize: 10, fill: "var(--color-muted)" };

/**
 * Whole-number ends two below and above the data. A fixed "dataMin - 2" gave
 * decimal ticks such as 128.7, whose leading digit the margin clipped.
 */
export function liftDomain(values: number[]): [number, number] {
  return [Math.floor(Math.min(...values) - 2), Math.ceil(Math.max(...values) + 2)];
}

export const liftTick = (v: number) => String(Math.round(v));

/**
 * One lift over the trend span (redesign part 3b, §4): each session's best as
 * an estimated 1RM (or reps), new bests white and the rest dim, with a dashed
 * fitted line that never reads as measurement. It lives here because this file
 * is the one charting boundary; ProgressionChart broke that rule and is gone.
 */
export function LiftChart({ points, unit, allHistory = false }: { points: LiftChartPoint[]; unit: "kg" | "reps"; allHistory?: boolean }) {
  const data = useMemo(() => {
    if (points.length < 2) return [];
    // linearTrend takes {x,y}[] and trendPoint is (x, line): both compile the wrong way round.
    const line = linearTrend(points.map((p, i) => ({ x: i, y: p.value })));
    return points.map((p, i) => ({
      ...p,
      trend: i === 0 || i === points.length - 1 ? trendPoint(i, line) : undefined,
    }));
  }, [points]);

  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-muted">Not enough sessions to chart yet.</p>;
  }

  return (
    <div
      className="h-48"
      role="img"
      aria-label={`${unit === "kg" ? "Estimated 1RM" : "Reps"} per session, ${points.length} sessions${allHistory ? ", all history" : ""}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-raised)" vertical={false} />
          <XAxis dataKey="date" tick={LIFT_TICK} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis
            tick={LIFT_TICK}
            tickFormatter={liftTick}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={liftDomain(points.map((p) => p.value))}
            allowDecimals={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: LiftChartPoint }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={props.payload?.isBest ? 3 : 2}
                fill={props.payload?.isBest ? "var(--color-accent)" : "var(--color-dim)"}
                stroke="none"
              />
            )}
          />
          <Line
            type="linear"
            dataKey="trend"
            stroke="var(--color-dim)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
