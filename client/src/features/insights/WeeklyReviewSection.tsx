import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftISO } from "@dashboard/shared";
import type { WeeklyReview } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useWeeklyReview } from "@/hooks/useInsights";
import { lastFullWeek, percentChange, signed, weekLabel } from "./format";

const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");

function trainingLine(r: WeeklyReview): string {
  const { days, sets, volume } = r.current.training;
  const change = percentChange(volume, r.previous.training.volume);
  return `${days} of ${r.trainingTarget} days · ${sets} ${sets === 1 ? "set" : "sets"} · ${n0(volume)} kg${change ? ` (${change})` : ""}`;
}

function foodLine(r: WeeklyReview): string {
  const f = r.current.food;
  // An empty week is "nothing logged", never "0 kcal".
  if (f.daysLogged === 0 || f.avgKcal === null || f.avgProteinG === null) return "No food logged";
  const t = r.foodTarget;
  return (
    `${f.daysLogged} ${f.daysLogged === 1 ? "day" : "days"} logged · ` +
    `avg ${n0(f.avgKcal)} kcal${t ? ` of ${n0(t.calories)}` : ""} · ` +
    `${n0(f.avgProteinG)} g protein${t ? ` of ${n0(t.proteinG)}` : ""}`
  );
}

function weightLine(r: WeeklyReview): string {
  const now = r.current.weight.average;
  const before = r.previous.weight.average;
  if (now === null) return "No weigh-ins";
  return `avg ${now.toFixed(1)} kg${before === null ? "" : ` (${signed(now - before, 1)})`}`;
}

export function WeeklyReviewSection({ today }: { today: string }) {
  const latest = lastFullWeek(today);
  // Only a week the user stepped back to is state. Until then the review
  // follows the clock, so an app left open over Sunday night moves on (the
  // Food page's rule).
  const [picked, setPicked] = useState<string | null>(null);
  const week = picked ?? latest;
  const setWeek = (w: string) => setPicked(w >= latest ? null : w);
  const review = useWeeklyReview(week);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="lbl">Weekly review</div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous week"
            onClick={() => setWeek(shiftISO(week, -7))}
            className="rounded-full p-1.5 text-muted hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tnum text-xs text-muted">{weekLabel(week, today)}</span>
          <button
            aria-label="Next week"
            disabled={week >= latest}
            onClick={() => setWeek(shiftISO(week, 7))}
            className="rounded-full p-1.5 text-muted hover:text-text disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {review.data && review.isError && (
        // A failed refresh keeps the last good week on screen (the Food page's pattern).
        <p className="mt-2 text-xs text-dim">Couldn't refresh — showing saved data.</p>
      )}
      {review.data ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="lbl text-dim">Training</dt>
            <dd className="tnum">{trainingLine(review.data)}</dd>
          </div>
          <div>
            <dt className="lbl text-dim">Food</dt>
            <dd className="tnum">{foodLine(review.data)}</dd>
          </div>
          <div>
            <dt className="lbl text-dim">Weight</dt>
            <dd className="tnum">{weightLine(review.data)}</dd>
          </div>
        </dl>
      ) : review.isError ? (
        // Only with nothing to show: a failed refresh keeps the last good week.
        <div className="mt-3">
          <p className="text-sm text-negative">Could not load this week</p>
          <Button variant="ghost" className="mt-2" onClick={() => void review.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <Spinner label="Loading the week" />
      )}
    </Card>
  );
}
