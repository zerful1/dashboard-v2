import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMotionSafe } from "@/lib/motion";

export interface ChartPoint {
  /**
   * YYYY-MM-DD. A string end to end.
   *
   * Every one of the 58 migrated weigh-ins falls in a BST month, so a value
   * that round-trips through a JS Date shifts by a day — all of them, not
   * half. Recharts treats this as a plain category on the x-axis and never
   * constructs a Date from it, which is why it is here.
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
 * data, per the token rule.
 */
export function WeightChart({ points, trend }: Props) {
  // One row per point, with the trend value present only at its two endpoints.
  // `connectNulls` then draws a single straight segment between them, which is
  // what keeps the overlay reading as a trend rather than as a second series
  // tracking the data.
  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;
  const data = points.map((p) => ({
    date: p.date,
    kg: p.kg,
    trend:
      p.date === first ? trend[0]?.kg : p.date === last ? trend[1]?.kg : null,
  }));

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-card border border-raised bg-surface">
        <p className="text-sm text-dim">No weigh-ins to chart yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-raised bg-surface p-4">
      <div className="lbl">Weight · {points.length} entries</div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--color-raised)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--color-dim)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              // Ten months of weigh-ins would overlap every label. Start and end
              // are the two a reader actually looks for.
              interval="preserveStartEnd"
              minTickGap={48}
              // Sliced, not parsed: turning this into a Date to format it would
              // reintroduce exactly the shift the string is here to prevent.
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              stroke="var(--color-dim)"
              tick={{ fontSize: 10 }}
              tickLine={false}
              width={44}
              domain={["dataMin - 1", "dataMax + 1"]}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-raised)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-raised)",
                borderRadius: "11px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "var(--color-muted)" }}
              // Params are inferred from Recharts' Formatter type rather than
              // annotated: its ValueType/NameType are generic, so hand-written
              // `number`/`string` annotations do not satisfy it.
              formatter={(value, name) => [
                `${Number(value).toFixed(1)} kg`,
                name === "kg" ? "Weight" : "Trend",
              ]}
            />
            <Line
              type="monotone"
              dataKey="kg"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              // The one accent on this card, and it is the data itself.
              activeDot={{ r: 3, fill: "var(--color-accent)" }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="trend"
              stroke="var(--color-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
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
 */
export function WeightSparkline({ points }: { points: ChartPoint[] }) {
  const safe = useMotionSafe();
  if (points.length < 2) return null;

  return (
    <div className="h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
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
