import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  type PlotArea,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { daysBetweenISO, nextMonthStart, setCell, shiftISO, type AveragePoint, type LiftChartPoint } from "@dashboard/shared";
import { useMotionSafe } from "@/lib/motion";
import { listDate, monthTick } from "@/lib/dates";
import { dayMonth } from "@/features/insights/format";
import { axisDomain } from "@/lib/axisDomain";
import { cn } from "@/lib/cn";
import { goalPlacement } from "./deriveWeight";

export interface ChartPoint {
  /** YYYY-MM-DD, a string end to end: a Date round trip shifts BST-month weigh-ins by a day. */
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

/** The weigh-ins from `start` as day-axis rows with their 7-day average, a null row breaking the line across gaps over 7 days. */
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

/** Ticks every 7 days for one month, else each 1st, unless fewer than two 1sts fall in range, then weekly. */
export function weightTicks(start: string, today: string, weekly: boolean): { x: number; label: string }[] {
  if (!weekly) {
    const months: { x: number; label: string }[] = [];
    for (let d = start.endsWith("-01") ? start : nextMonthStart(start); d <= today; d = nextMonthStart(d)) {
      months.push({ x: daysBetweenISO(start, d), label: monthTick(d) });
    }
    if (months.length >= 2) return months;
  }
  const ticks: { x: number; label: string }[] = [];
  const total = daysBetweenISO(start, today);
  for (let back = 0; back <= total; back += 7) ticks.unshift({ x: total - back, label: dayMonth(shiftISO(today, -back), today) });
  return ticks;
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

/** THE swappable boundary: nothing outside this file imports a charting library (Recharts; Bklit coerced x through `new Date`). */
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
      {/* A goal outside the chart's range is named, not reached for: stretching the axis squashed the line. */}
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
              // Today sits at the axis's end and 1M labels it: inset the end so the centred label fits inside the chart.
              padding={{ left: 0, right: 16 }}
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
              domain={axisDomain([...dots.map((d) => d.kg), ...avgs.map((a) => a.kg)])}
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

/** The 7-day average with a null between points over 7 days apart; a point with a break on both sides is `lone`, drawn as a dot. */
export function sparklineRows(line: AveragePoint[]): { date: string; kg: number | null; lone: boolean }[] {
  const rows = line.flatMap((p) =>
    p.gapBefore ? [{ date: `${p.date}-gap`, kg: null }, { date: p.date, kg: p.kg }] : [{ date: p.date, kg: p.kg }],
  );
  return rows.map((r, i) => ({ ...r, lone: r.kg !== null && rows[i - 1]?.kg == null && rows[i + 1]?.kg == null }));
}

/** A sparkline (shape only) that animates on purpose, in the Home tile, drawing the 7-day average; it lives here to keep one charting import site. */
export function WeightSparkline({ line }: { line: AveragePoint[] }) {
  const safe = useMotionSafe();
  if (line.length < 2) return null;

  return (
    <div className="h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sparklineRows(line)}>
          {/* Without a domain Recharts pads to round numbers and a 0.4 kg move renders flat. */}
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="var(--color-accent)"
            strokeWidth={2}
            // Only a lone point gets a dot: after a gap the newest average has nothing to join.
            dot={(props: unknown) => {
              const { cx, cy, index, payload } = props as { cx?: number; cy?: number; index?: number; payload?: { lone?: boolean } };
              const key = `dot-${index}`;
              if (cx == null || cy == null || !payload?.lone) return <g key={key} />;
              return <circle key={key} cx={cx} cy={cy} r={2.5} fill="var(--color-accent)" />;
            }}
            isAnimationActive={safe}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tick text for LiftChart: muted, because axis labels are words to read (CLAUDE.md). */
export const LIFT_TICK = { fontSize: 10, fill: "var(--color-muted)" };

export const liftTick = (v: number) => String(Math.round(v));

/** The tapped day in words: "2 Oct · 75 × 8 · new high". */
export function liftReadout(p: LiftChartPoint, today: string): string {
  return `${dayMonth(p.date, today)} · ${setCell(p.set)}${p.isBest ? " · new high" : ""}`;
}

/** The day whose column x falls in (bars share the width equally); a tap in an axis gutter takes the nearest day. */
export function dayAt(x: number, plot: { x: number; width: number }, count: number): number {
  const i = Math.floor(((x - plot.x) / plot.width) * count);
  return Math.min(count - 1, Math.max(0, i));
}

/** A two-digit count at the tick size needs about this much room to stand clear of the next. */
const COUNT_ROOM = 16;

/** Every day's count when they fit side by side; on a crowded chart, only the picked day's. */
export function repCountShown(columnWidth: number, index: number, shown: number): boolean {
  return columnWidth >= COUNT_ROOM || index === shown;
}

/** A bar's rep count, over it; Recharts clones this per bar with its box as `viewBox`, muted as words to read. */
function RepCount({
  viewBox,
  value,
  index,
  shown,
  count,
}: {
  viewBox?: { x?: number; y?: number; width?: number };
  value?: unknown;
  index?: number;
  shown: number;
  count: number;
}) {
  const plot = usePlotArea();
  if (!plot || index == null || viewBox?.x == null || viewBox.y == null) return null;
  if (!repCountShown(plot.width / count, index, shown)) return null;
  return (
    <text
      className="lift-rep-count tnum"
      x={viewBox.x + (viewBox.width ?? 0) / 2}
      y={viewBox.y - 4}
      textAnchor="middle"
      fontSize={LIFT_TICK.fontSize}
      fill={index === shown ? "var(--color-text)" : LIFT_TICK.fill}
    >
      {String(value)}
    </text>
  );
}

/** Hands the chart's plot area out of Recharts, whose hooks only work inside a chart. */
function PlotAreaInto({ into }: { into: { current: PlotArea | null } }) {
  const plot = usePlotArea();
  useEffect(() => {
    into.current = plot ?? null;
  });
  return null;
}

/** The share of the plot the rep bars take, at the bottom, and the line's gap above them. */
const BARS = 0.28;
// Room for a rep count over the tallest bar, and a dot's radius, before the line.
const GAP = 0.1;

/** The kg axis, stretched below the data so the line keeps clear of the bars and the gridlines stay among the data. */
export function liftKgAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  const [lo, hi] = axisDomain(values);
  const below = ((hi - lo) * (BARS + GAP)) / (1 - BARS - GAP);
  const mid = Math.round((lo + hi) / 2);
  return { domain: [lo - below, hi], ticks: [...new Set([lo, mid, hi])] };
}

/** With no line above (a bodyweight lift), the share of the height the bars may take: the rest is room for counts. */
const BARS_ALONE = 0.85;

/** The reps axis: from zero, so a bar's height is its reps, topping out at the bar strip, or below the counts' room. */
export function liftRepsDomain(reps: number[], bars: boolean): [number, number] {
  const max = Math.max(...reps, 1);
  return [0, max / (bars ? BARS : BARS_ALONE)];
}

/** The reps axis's labels, when it shows: zero, halfway and the most reps done. The headroom above goes unlabelled. */
export function liftRepsTicks(reps: number[]): number[] {
  const max = Math.max(...reps, 1);
  return [...new Set([0, Math.round(max / 2), max])];
}

/** One lift over the trend span: heaviest weight per day as a line, reps as bars on one shared x axis; the picked day is named in a fixed line, not a tooltip (CLAUDE.md). */
export function LiftChart({
  points,
  unit,
  today,
  allHistory = false,
}: {
  points: LiftChartPoint[];
  unit: "kg" | "reps";
  today: string;
  allHistory?: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const plot = useRef<PlotArea | null>(null);
  const data = useMemo(() => points.map((p) => ({ ...p, reps: p.set.reps })), [points]);
  const weighted = unit === "kg";
  const kgAxis = useMemo(() => (weighted && points.length > 0 ? liftKgAxis(points.map((p) => p.value)) : null), [weighted, points]);

  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-muted">Not enough sessions to chart yet.</p>;
  }

  // A stale pick (the lift's points changed under it) falls back to the latest day.
  const shown = picked !== null && picked < points.length ? picked : points.length - 1;
  // Worked out from the pointer, not Recharts' tooltip state: on a phone a tap's click carries no active day.
  const pickAt = (e: { clientX: number; currentTarget: HTMLElement }) => {
    if (!plot.current) return;
    setPicked(dayAt(e.clientX - e.currentTarget.getBoundingClientRect().left, plot.current, points.length));
  };

  return (
    <div>
      <p className="tnum text-xs text-text" aria-live="polite">
        {liftReadout(points[shown]!, today)}
      </p>
      <div
        className={cn("mt-2 cursor-pointer", weighted ? "h-56" : "h-40")}
        role="img"
        aria-label={`${weighted ? "Heaviest weight and its reps" : "Reps"} per session, ${points.length} sessions${allHistory ? ", all history" : ""}`}
        onClick={pickAt}
        // Hover picks on a desktop; on a touch screen a move is a scroll, not a pick.
        onPointerMove={(e) => e.pointerType === "mouse" && pickAt(e)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <PlotAreaInto into={plot} />
            {weighted && <CartesianGrid stroke="var(--color-raised)" vertical={false} yAxisId="kg" syncWithTicks />}
            <XAxis
              dataKey="date"
              tick={LIFT_TICK}
              tickFormatter={(d: string) => dayMonth(d, today)}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            {kgAxis && (
              <YAxis
                yAxisId="kg"
                tick={LIFT_TICK}
                tickFormatter={liftTick}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={kgAxis.domain}
                ticks={kgAxis.ticks}
              />
            )}
            <YAxis
              yAxisId="reps"
              hide={weighted}
              tick={LIFT_TICK}
              tickFormatter={liftTick}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              domain={liftRepsDomain(data.map((d) => d.reps), weighted)}
              ticks={liftRepsTicks(data.map((d) => d.reps))}
            />
            {/* Reps from zero. Data, so muted (never dim or raised); the picked day white. */}
            <Bar yAxisId="reps" dataKey="reps" maxBarSize={10} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.date} fill={i === shown ? "var(--color-accent)" : "var(--color-muted)"} />
              ))}
              <LabelList dataKey="reps" content={<RepCount shown={shown} count={points.length} />} />
            </Bar>
            {weighted && (
              <Line
                yAxisId="kg"
                type="monotone"
                dataKey="value"
                stroke="var(--color-accent)"
                strokeWidth={2}
                isAnimationActive={false}
                activeDot={false}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: LiftChartPoint }) => {
                  const { cx, cy, index, payload } = props;
                  const key = `dot-${index}`;
                  if (cx == null || cy == null) return <g key={key} />;
                  // The picked day: a white ring, as the Weight chart marks its latest.
                  if (index === shown) {
                    return <circle key={key} cx={cx} cy={cy} r={4} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={2} />;
                  }
                  return (
                    <circle
                      key={key}
                      cx={cx}
                      cy={cy}
                      r={payload?.isBest ? 3 : 2}
                      fill={payload?.isBest ? "var(--color-accent)" : "var(--color-dim)"}
                      stroke="none"
                    />
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        {weighted && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-3 border-t-2 border-text" /> heaviest kg
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-1 rounded-[1px] bg-muted" /> {weighted ? "reps at it" : "reps"}
        </span>
      </div>
    </div>
  );
}
