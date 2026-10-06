import { Link } from "react-router-dom";
import { trendTone } from "@dashboard/shared";
import { Card } from "@/components/ui/Card";
import type { WeightSummary } from "@/features/weight/deriveWeight";
import { WeightSparkline } from "@/features/weight/WeightChart";

export interface HomeWeight {
  summary: WeightSummary;
  goalKg: number | null;
  isError: boolean;
}

/** The latest weight and its week, green only toward the goal. Hidden until there is a weigh-in. */
export function WeightSection({ weight }: { weight: HomeWeight }) {
  if (weight.isError) {
    return (
      <Card>
        <div className="lbl">Weight</div>
        <p className="mt-1 text-sm text-muted">Couldn't load your weight.</p>
      </Card>
    );
  }
  const { summary, goalKg } = weight;
  if (summary.latest === null) return null;
  const delta = summary.deltaWeek;
  const tone = delta === null ? null : trendTone(summary.latest - delta, summary.latest, goalKg);

  return (
    <Link to="/weight" className="block border-t border-raised py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="lbl">Weight</div>
          <div className="figure mt-1 text-3xl">
            {summary.latest.toFixed(1)}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted">kg</span>
          </div>
          {delta === null || tone === null ? (
            <div className="mt-1 text-xs text-muted">No entry this week</div>
          ) : (
            <div data-tone={tone} className={`tnum mt-1 text-xs ${tone === "good" ? "text-good" : "text-muted"}`}>
              {delta !== 0 && <span aria-hidden className="mr-1">{delta < 0 ? "▼" : "▲"}</span>}
              {`${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg in 7 days`}
            </div>
          )}
        </div>
        <div className="w-28 shrink-0">
          <WeightSparkline points={summary.points.slice(-30)} />
        </div>
      </div>
    </Link>
  );
}
