import { motion } from "motion/react";
import { trendTone } from "@dashboard/shared";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import type { WeightSummary } from "./deriveWeight";

/**
 * Green only when the change moved toward the weight goal, and white
 * otherwise, with the arrow giving the direction (redesign spec §5.8). Never
 * amber or red: whether a weight is "bad" depends on the phase, and the goal
 * already says what progress is.
 */
function Delta({ value, latest, goalKg, label }: {
  value: number | null;
  latest: number | null;
  goalKg: number | null;
  label: string;
}) {
  if (value === null || latest === null) {
    return (
      <div>
        <div className="lbl">{label}</div>
        <div className="mt-1 text-sm text-dim">—</div>
      </div>
    );
  }
  const tone = trendTone(latest - value, latest, goalKg);
  return (
    <div>
      <div className="lbl">{label}</div>
      <div data-tone={tone} className={`tnum mt-1 text-sm font-semibold ${tone === "good" ? "text-good" : "text-text"}`}>
        {value !== 0 && <span aria-hidden className="mr-1">{value < 0 ? "▼" : "▲"}</span>}
        {value > 0 ? "+" : ""}
        {value.toFixed(1)} kg
      </div>
    </div>
  );
}

export function WeightStats({ summary, goalKg }: { summary: WeightSummary; goalKg: number | null }) {
  const safe = useMotionSafe();

  return (
    <div className="border-t border-raised py-4">
      <div className="lbl">Current</div>
      <motion.div
        // Keyed on the value so it re-mounts and re-animates when it changes:
        // a new weigh-in is visibly acknowledged rather than silently swapped.
        key={summary.latest ?? "none"}
        initial={{ opacity: 0, y: safe ? 6 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springOrNone(TRANSITIONS.snappy, safe)}
        className="figure mt-1 text-5xl"
      >
        {summary.latest?.toFixed(1) ?? "—"}
        <span className="ml-1 text-base font-normal tracking-normal text-muted">kg</span>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Delta value={summary.deltaWeek} latest={summary.latest} goalKg={goalKg} label="7 days" />
        <Delta value={summary.deltaMonth} latest={summary.latest} goalKg={goalKg} label="30 days" />
        <div>
          <div className="lbl">Lowest</div>
          <div className="tnum mt-1 text-sm font-semibold">{summary.lowest?.toFixed(1) ?? "—"}</div>
        </div>
        <div>
          <div className="lbl">Streak</div>
          <div className="tnum mt-1 text-sm font-semibold">
            {summary.streak}
            <span className="text-muted"> d</span>
          </div>
        </div>
      </div>
    </div>
  );
}
