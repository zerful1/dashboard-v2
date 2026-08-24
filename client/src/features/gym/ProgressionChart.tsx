import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { linearTrend, trendPoint } from "@dashboard/shared";
import type { ExerciseChartPoint } from "@dashboard/shared";
import { cn } from "@/lib/cn";

type Metric = "topWeight" | "e1rm" | "volume";

const METRICS: { key: Metric; label: string }[] = [
  { key: "topWeight", label: "Top set" },
  { key: "e1rm", label: "Est. 1RM" },
  { key: "volume", label: "Volume" },
];

export function ProgressionChart({
  chartData,
  bodyweightOnly,
}: {
  chartData: ExerciseChartPoint[];
  bodyweightOnly: boolean;
}) {
  const [metric, setMetric] = useState<Metric>("topWeight");
  // A bodyweight-only exercise has no weight to plot, so top reps is the only
  // meaningful series and the toggle is hidden entirely.
  const active: Metric | "topReps" = bodyweightOnly ? "topReps" : metric;

  const series = useMemo(() => {
    // Each metric filters its OWN null gaps. A session with only bodyweight
    // sets has no e1rm; keeping the null would break the line rather than
    // bridging it.
    const points = chartData
      .map((p) => ({ date: p.date, value: p[active] }))
      .filter((p): p is { date: string; value: number } => p.value !== null);

    if (points.length < 2) return { points, trend: [] as { date: string; value: number }[] };

    // linearTrend takes {x,y}[] and trendPoint is (x, trend) — both easy to get
    // backwards, and both compile either way round while returning a number.
    const line = linearTrend(points.map((p, i) => ({ x: i, y: p.value })));
    return {
      points,
      trend: [
        { date: points[0]!.date, value: trendPoint(0, line) },
        { date: points[points.length - 1]!.date, value: trendPoint(points.length - 1, line) },
      ],
    };
  }, [chartData, active]);

  const merged = series.points.map((p, i) => ({
    date: p.date,
    value: p.value,
    trend:
      i === 0
        ? series.trend[0]?.value
        : i === series.points.length - 1
          ? series.trend[1]?.value
          : undefined,
  }));

  if (series.points.length === 0) {
    return (
      <div className="rounded-card border border-raised bg-surface p-6 text-center text-sm text-dim">
        Not enough data to chart yet.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-raised bg-surface p-3">
      {!bodyweightOnly && (
        <div className="mb-3 flex gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={cn(
                "flex-1 rounded-md py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                // Tinted: a selection within a set, not the screen's action.
                metric === m.key ? "bg-accent/10 text-accent" : "text-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            {/* var(--color-*) rather than hexes, so the chart inherits the
                palette — the same discipline as WeightChart. `raised` is
                gridlines only, never a data colour. */}
            <CartesianGrid stroke="var(--color-raised)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-dim)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: "var(--color-dim)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-raised)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-muted)" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-accent)" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {/* Dashed muted so the fitted line never reads as measurement. */}
            <Line
              type="linear"
              dataKey="trend"
              stroke="var(--color-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
