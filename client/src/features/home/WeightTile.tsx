import { Link } from "react-router-dom";
import { motion } from "motion/react";
import type { WeightSummary } from "@/features/weight/deriveWeight";
import { WeightSparkline } from "@/features/weight/WeightChart";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";

export function WeightTile({ summary }: { summary: WeightSummary }) {
  const safe = useMotionSafe();
  const spark = summary.points.slice(-30);

  return (
    <motion.div
      whileHover={safe ? { y: -2 } : undefined}
      transition={springOrNone(TRANSITIONS.snappy, safe)}
    >
      <Link to="/weight" className="block rounded-card border border-raised bg-surface p-4">
        <div className="lbl">Body weight</div>
        <div className="tnum mt-1 text-3xl font-extrabold tracking-tight">
          {summary.latest?.toFixed(1) ?? "—"}
          <span className="ml-1 text-sm font-semibold text-muted">kg</span>
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {summary.deltaWeek === null
            ? "No entry this week"
            : `${summary.deltaWeek > 0 ? "+" : ""}${summary.deltaWeek.toFixed(1)} kg in 7 days`}
        </div>

        <div className="mt-2">
          <WeightSparkline points={spark} />
        </div>
      </Link>
    </motion.div>
  );
}
