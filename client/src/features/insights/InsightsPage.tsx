import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { mondayOf, shiftISO } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToday } from "@/hooks/useToday";
import { useGoals } from "@/hooks/useGoals";
import { useRecords, useWeeklyReview } from "@/hooks/useInsights";
import { useHistoryExerciseNames } from "@/hooks/useExerciseStats";
import { lastFullWeek, weekLabel } from "./format";
import { WeekRows } from "./WeekRows";
import { RecordList } from "./RecordList";
import { recordsIn } from "./recordLine";
import { GoalsSection } from "./GoalsSection";

const SAVED = "Couldn't refresh — showing saved data.";

/** Last week at a glance, the records it set, this week's so far, and the goals (redesign part 6). */
export function InsightsPage() {
  // One clock for the page (CLAUDE.md).
  const today = useToday();
  const latest = lastFullWeek(today);
  // Only a week stepped back to is state: until then the page follows the clock,
  // so an app left open over Sunday night moves on (the Food page's rule).
  const [picked, setPicked] = useState<string | null>(null);
  const week = picked ?? latest;
  const setWeek = (w: string) => setPicked(w >= latest ? null : w);

  const review = useWeeklyReview(week);
  const records = useRecords();
  const goals = useGoals();
  const historyNames = useHistoryExerciseNames();
  // The weight change is coloured by the goal: wait for it, or its failure (isPending, CLAUDE.md).
  const goalsSettled = !goals.isPending;
  const goalKg = goals.goals.find((g) => g.kind === "weight")?.target_kg ?? null;
  const all = records.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>

      <section aria-label="The week">
        <div className="flex items-center justify-between">
          <span className="lbl">{week === latest ? "Last week" : "Week"}</span>
          <div className="flex items-center gap-1">
            <button aria-label="Previous week" onClick={() => setWeek(shiftISO(week, -7))} className="rounded-full p-1.5 text-muted hover:text-text">
              <ChevronLeft size={16} />
            </button>
            <span className="tnum text-xs text-text">{weekLabel(week, today)}</span>
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
        {review.data && review.isError && <p className="mt-2 text-xs text-muted">{SAVED}</p>}
        {review.data && goalsSettled ? (
          <div className="mt-2">
            <WeekRows review={review.data} goalKg={goalKg} />
          </div>
        ) : review.isError && !review.data ? (
          <div className="mt-3">
            <p className="text-sm text-negative">Could not load this week</p>
            <Button variant="ghost" className="mt-2" onClick={() => void review.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Spinner label="Loading the week" />
        )}
      </section>

      {records.data ? (
        <>
          {records.isError && <p className="text-xs text-muted">{SAVED}</p>}
          {/* Keyed by the week, so an open "N more" closes when the week changes. */}
          <RecordList key={week} title="Records that week" events={recordsIn(all, week, shiftISO(week, 6))} empty="No records that week." />
          <RecordList title="This week so far" events={recordsIn(all, mondayOf(today), today)} empty="None yet this week." />
        </>
      ) : records.isError ? (
        <section>
          <h2 className="lbl">Records that week</h2>
          <p className="mt-2 text-sm text-negative">Couldn't load records</p>
          <Button variant="ghost" className="mt-2" onClick={() => void records.refetch()}>
            Retry
          </Button>
        </section>
      ) : (
        <Spinner label="Loading records" />
      )}

      <GoalsSection today={today} historyNames={historyNames.data ?? []} />
    </div>
  );
}
