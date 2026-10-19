import { motion } from "motion/react";
import type { CompositionLine, Goal } from "@dashboard/shared";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import type { WeightSummary } from "./deriveWeight";
import { goalLine, latestText, rateLine } from "./weightText";

interface Props {
  summary: WeightSummary;
  today: string;
  /** The weight goal, or null with none. */
  goal: Goal | null;
  /** The goals could not be loaded, and none are saved to show. */
  goalsFailed: boolean;
  /** What the weight is made of (compositionLine), or null with too little to say. */
  composition: CompositionLine | null;
}

const TONE_CLASS = { good: "text-good", caution: "text-caution", neutral: "text-text" } as const;

/**
 * Where the weight is and which way it is going, in words, before anything
 * else (redesign part 5, §2–3): the 7-day average, Insights' rate, and the
 * goal's projection. Then what the weight is made of, from the same rate and
 * Gym's lift statuses (housekeeping §4, mockup 1A).
 */
export function WeightHeadline({ summary, today, goal, goalsFailed, composition }: Props) {
  const safe = useMotionSafe();
  const rate = rateLine(summary.fit, goal);
  const latest =
    summary.latest !== null && summary.latestDate !== null ? ` · ${latestText(summary.latest, summary.latestDate, today)}` : "";

  return (
    <div>
      <div className="lbl">7-day average</div>
      <motion.div
        // Keyed on the value so it re-mounts and re-animates when it changes:
        // a new weigh-in is visibly acknowledged rather than silently swapped.
        key={summary.average7 ?? "none"}
        initial={{ opacity: 0, y: safe ? 6 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springOrNone(TRANSITIONS.snappy, safe)}
        className="figure mt-1 text-5xl"
      >
        {summary.average7 === null ? (
          <span className="text-dim">—</span>
        ) : (
          <>
            {summary.average7.toFixed(1)}
            <span className="ml-1 text-base font-normal tracking-normal text-muted">kg</span>
          </>
        )}
      </motion.div>

      <p className="tnum mt-3 text-sm">
        {summary.latest === null ? (
          <span className="text-muted">No weigh-ins yet</span>
        ) : summary.average7 === null ? (
          <span className="text-muted">No weigh-in in 7 days</span>
        ) : rate.kind === "rate" ? (
          <span data-tone={rate.tone} className={rate.tone === "good" ? "text-good" : "text-text"}>
            <span aria-hidden className="mr-1">{rate.arrow}</span>
            {rate.text}
          </span>
        ) : rate.kind === "flat" ? (
          <span>Flat</span>
        ) : (
          <span className="text-muted">Not enough weigh-ins for a rate ({rate.have} of {rate.need})</span>
        )}
        {latest && <span className="text-muted">{latest}</span>}
      </p>

      {goalsFailed ? (
        <p className="mt-1 text-xs text-muted">Couldn't load your goal</p>
      ) : (
        goal && <p className="tnum mt-1 text-xs text-muted">{goalLine(goal, summary.points, today)}</p>
      )}

      {/* Not beside "No weigh-in in 7 days": the rate holds back, so this does too. */}
      {composition && summary.average7 !== null && (
        <p className="mt-1 text-xs text-muted">
          <span data-tone={composition.tone} className={TONE_CLASS[composition.tone]}>
            {composition.verdict}
          </span>{" "}
          · {composition.detail}
        </p>
      )}
    </div>
  );
}
