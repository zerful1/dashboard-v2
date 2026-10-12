import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import type { WeightSummary } from "@/features/weight/deriveWeight";
import { WeightSparkline } from "@/features/weight/WeightChart";
import { rateLine } from "@/features/weight/weightText";

export interface HomeWeight {
  summary: WeightSummary;
  goalKg: number | null;
  isError: boolean;
}

/**
 * The latest weigh-in, and the Weight page's own rate under it (redesign part
 * 5, §6), green only toward the goal. Hidden until there is a weigh-in.
 */
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
  const rate = rateLine(summary.fit, goalKg);

  return (
    <Link to="/weight" className="block border-t border-raised py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="lbl">Weight</div>
          <div className="figure mt-1 text-3xl">
            {summary.latest.toFixed(1)}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted">kg</span>
          </div>
          {rate.kind === "rate" ? (
            <div data-tone={rate.tone} className={`tnum mt-1 text-xs ${rate.tone === "good" ? "text-good" : "text-muted"}`}>
              <span aria-hidden className="mr-1">{rate.arrow}</span>
              {rate.text}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">{rate.kind === "flat" ? "Flat" : "Not enough weigh-ins for a rate"}</div>
          )}
        </div>
        <div className="w-28 shrink-0">
          <WeightSparkline line={summary.line.slice(-30)} />
        </div>
      </div>
    </Link>
  );
}
