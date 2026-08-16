import { motion } from "motion/react";
import type { SplitDay } from "@dashboard/shared";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function DaySelector({
  days,
  selected,
  onChange,
}: {
  days: SplitDay[];
  selected: number;
  onChange: (d: number) => void;
}) {
  const safe = useMotionSafe();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {days.map(({ day_type, label }) => {
        const active = selected === day_type;
        return (
          <motion.button
            key={day_type}
            onClick={() => onChange(day_type)}
            whileTap={safe ? { scale: 0.96 } : undefined}
            transition={springOrNone(TRANSITIONS.snappy, safe)}
            aria-pressed={active}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition-colors",
              // TINTED, not filled. This is a selection within a set, and the
              // filled accent belongs to the one action on the screen — which
              // is "Add set" in the exercise sheet. Two filled terracotta
              // elements meaning different things is what the role rule exists
              // to prevent.
              active
                ? "border-accent/40 bg-accent/10 font-semibold text-accent"
                : "border-raised bg-surface text-muted",
            )}
          >
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}
