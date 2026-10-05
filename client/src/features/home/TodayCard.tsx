import { Link } from "react-router-dom";
import { motion } from "motion/react";
import type { HomeToday } from "@dashboard/shared";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function TodayCard({ today }: { today: HomeToday }) {
  const safe = useMotionSafe();

  return (
    <motion.div
      initial={safe ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={springOrNone(TRANSITIONS.snappy, safe)}
      className="border-t border-raised py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="lbl text-accent">Today</div>
          <div className="mt-1 truncate text-xl font-semibold tracking-tight">
            {today.label}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {today.isRest
              ? "Nothing scheduled"
              : today.started
                ? "In progress"
                : "Not started"}
          </div>
        </div>

        {/* No action on a rest day: there is nothing to log, and an enabled
            button would imply otherwise. */}
        {!today.isRest && (
          // Button is a plain <button> — it has no asChild — and this navigates
          // rather than acting, so it must be a real anchor: middle-click,
          // long-press and "open in new tab" all depend on that. The classes
          // are copied from Button's primary variant rather than approximated,
          // focus ring included: an accent action with no visible focus state
          // is the one regression an eyeball check never catches.
          <Link
            to="/gym"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full px-4 py-2.5",
              "text-sm font-semibold transition",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              "bg-accent text-bg hover:brightness-90 active:brightness-75",
            )}
          >
            {today.started ? "Continue" : "Log"}
          </Link>
        )}
      </div>
    </motion.div>
  );
}
