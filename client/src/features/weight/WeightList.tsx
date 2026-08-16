import { AnimatePresence, motion } from "motion/react";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import type { BodyWeightEntry } from "@dashboard/shared";

export function WeightList({
  entries,
  onSelect,
}: {
  entries: BodyWeightEntry[];
  onSelect: (e: BodyWeightEntry) => void;
}) {
  const safe = useMotionSafe();

  return (
    <div className="overflow-hidden rounded-card border border-raised bg-surface">
      <div className="lbl px-4 pt-3 pb-2">History</div>
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.button
            key={e.id}
            // `layout` makes neighbours slide when a row is inserted or removed,
            // so the change is trackable instead of the list snapping to a new
            // arrangement and leaving the reader to find what moved.
            layout
            initial={{ opacity: 0, height: safe ? 0 : "auto" }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: safe ? 0 : "auto" }}
            transition={springOrNone(TRANSITIONS.gentle, safe)}
            // `raised` — the border token. Used here as a hover surface, which
            // is the one non-border use the token rule allows, since it is
            // chrome rather than data.
            whileHover={safe ? { backgroundColor: "rgb(41 37 36)" } : undefined}
            onClick={() => onSelect(e)}
            className="flex w-full items-center justify-between border-t border-raised px-4 py-3 text-left"
          >
            {/* Rendered as stored. No Date, no reformatting — a weigh-in dated
                in BST would come back a day earlier if this parsed it. */}
            <span className="text-sm text-muted">{e.date}</span>
            <span className="tnum text-sm font-bold">{e.weight_kg.toFixed(1)} kg</span>
          </motion.button>
        ))}
      </AnimatePresence>
      {entries.length === 0 && (
        <p className="border-t border-raised px-4 py-6 text-center text-sm text-dim">
          No entries yet.
        </p>
      )}
    </div>
  );
}
