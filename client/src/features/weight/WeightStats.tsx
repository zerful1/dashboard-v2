import { motion } from "motion/react";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import type { WeightSummary } from "./deriveWeight";

/**
 * Sage for down, gold for up — weight direction is goal-dependent, so neither
 * is "good" and neither gets the positive/negative treatment. Never the accent:
 * that belongs to the one action on the screen, and a number is not an action.
 */
function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <div>
        <div className="lbl">{label}</div>
        <div className="mt-1 text-sm text-dim">—</div>
      </div>
    );
  }
  const tone = value < 0 ? "text-sage" : value > 0 ? "text-gold" : "text-muted";
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className={`tnum mt-1 text-sm font-bold ${tone}`}>
        {value > 0 ? "+" : ""}
        {value.toFixed(1)} kg
      </div>
    </div>
  );
}

export function WeightStats({ summary }: { summary: WeightSummary }) {
  const safe = useMotionSafe();

  return (
    <div className="rounded-card border border-raised bg-surface p-4">
      <div className="lbl">Current</div>
      <motion.div
        // Keyed on the value so it re-mounts and re-animates when it changes:
        // a new weigh-in is visibly acknowledged rather than silently swapped.
        key={summary.latest ?? "none"}
        initial={{ opacity: 0, y: safe ? 6 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springOrNone(TRANSITIONS.snappy, safe)}
        className="tnum mt-1 text-4xl font-extrabold tracking-tight"
      >
        {summary.latest?.toFixed(1) ?? "—"}
        <span className="ml-1 text-base font-semibold text-muted">kg</span>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Delta value={summary.deltaWeek} label="7 days" />
        <Delta value={summary.deltaMonth} label="30 days" />
        <div>
          <div className="lbl">Lowest</div>
          <div className="tnum mt-1 text-sm font-bold">
            {summary.lowest?.toFixed(1) ?? "—"}
          </div>
        </div>
        <div>
          <div className="lbl">Streak</div>
          <div className="tnum mt-1 text-sm font-bold">
            {summary.streak}
            <span className="text-muted"> d</span>
          </div>
        </div>
      </div>
    </div>
  );
}
