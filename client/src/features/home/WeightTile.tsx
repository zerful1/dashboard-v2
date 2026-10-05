import { Link } from "react-router-dom";
import { trendTone } from "@dashboard/shared";
import { motion } from "motion/react";
import type { WeightSummary } from "@/features/weight/deriveWeight";
import { WeightSparkline } from "@/features/weight/WeightChart";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";

export function WeightTile({ summary, goalKg }: { summary: WeightSummary; goalKg: number | null }) {
  const safe = useMotionSafe();
  const spark = summary.points.slice(-30);
  // Green only toward the weight goal (redesign spec §5.8); white otherwise.
  const tone =
    summary.deltaWeek === null || summary.latest === null
      ? null
      : trendTone(summary.latest - summary.deltaWeek, summary.latest, goalKg);

  return (
    <motion.div
      whileHover={safe ? { y: -2 } : undefined}
      transition={springOrNone(TRANSITIONS.snappy, safe)}
    >
      <Link to="/weight" className="block border-t border-raised py-4">
        <div className="lbl">Body weight</div>
        <div className="figure mt-1 text-4xl">
          {summary.latest?.toFixed(1) ?? "—"}
          <span className="ml-1 text-sm font-normal tracking-normal text-muted">kg</span>
        </div>
        {summary.deltaWeek === null || summary.latest === null || tone === null ? (
          <div className="mt-1 text-xs text-muted">No entry this week</div>
        ) : (
          <div data-tone={tone} className={`tnum mt-1 text-xs ${tone === "good" ? "text-good" : "text-muted"}`}>
            {summary.deltaWeek !== 0 && (
              <span aria-hidden className="mr-1">{summary.deltaWeek < 0 ? "▼" : "▲"}</span>
            )}
            {`${summary.deltaWeek > 0 ? "+" : ""}${summary.deltaWeek.toFixed(1)} kg in 7 days`}
          </div>
        )}

        <div className="mt-2">
          <WeightSparkline points={spark} />
        </div>
      </Link>
    </motion.div>
  );
}
