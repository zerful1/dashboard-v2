import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { toLocalISO } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useWeights } from "@/hooks/useWeights";
import { deriveWeightSummary } from "@/features/weight/deriveWeight";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";
import { profileQuery } from "@/lib/profileQuery";
import { Card } from "@/components/ui/Card";

function WeightCard() {
  const { entries } = useWeights();
  const today = toLocalISO();
  const summary = useMemo(() => deriveWeightSummary(entries, today), [entries, today]);
  const safe = useMotionSafe();

  return (
    <motion.div
      // A 2px lift on hover: enough to say "this is pressable" without the card
      // appearing to detach from the page.
      whileHover={safe ? { y: -2 } : undefined}
      transition={springOrNone(TRANSITIONS.snappy, safe)}
    >
      <Link to="/weight" className="block rounded-card border border-raised bg-surface p-4">
        <div className="lbl">Body weight</div>
        <div className="tnum mt-1 text-3xl font-extrabold tracking-tight">
          {summary.latest?.toFixed(1) ?? "—"}
          <span className="ml-1 text-sm font-semibold text-muted">kg</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {summary.deltaWeek === null
            ? "No entry in the last week"
            : `${summary.deltaWeek > 0 ? "+" : ""}${summary.deltaWeek.toFixed(1)} kg in 7 days`}
        </div>
      </Link>
    </motion.div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useQuery(profileQuery);

  // Three cases, one answer. `display_name` is `NOT NULL DEFAULT ''`, so a
  // freshly registered user has an empty one; the query may still be in flight
  // on first paint; and it may have failed outright. The email is the only
  // value guaranteed present in all three, and `||` (not `??`) is what makes
  // the empty-string case fall through as well as the missing one.
  const heading = profile?.display_name || user?.email;

  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Overview</div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">{heading}</h1>
      </div>

      <WeightCard />

      <Card>
        <div className="lbl">Still to come</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Gym, nutrition, habits and media arrive in the next phases. Your account
          and profile are live now — try{" "}
          {/* A real link, and not accent-coloured: a link is none of the three
              roles terracotta marks, and accent-coloured text that could not be
              clicked was reading as one anyway. Same demoted treatment as every
              other link in the app. */}
          <Link to="/settings" className="text-text underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
