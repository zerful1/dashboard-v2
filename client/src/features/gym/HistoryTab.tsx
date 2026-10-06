import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { historyFilterNames, type GridDay, type SessionSummary, type WorkoutSession } from "@dashboard/shared";
import { useSplit } from "@/hooks/useSplit";
import { useToday } from "@/hooks/useToday";
import { useHistoryDayNames, useWorkoutHistory } from "@/hooks/useWorkoutHistory";
import { useTrainingGrid } from "@/hooks/useTrainingGrid";
import { List } from "@/components/ui/List";
import { Spinner } from "@/components/ui/Spinner";
import { prettyDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { TrainingGrid } from "./TrainingGrid";
import { SessionDetailSheet } from "./SessionDetailSheet";

const counts = (s: SessionSummary) =>
  s.sets === 0 ? "Cardio" : `${s.lifts} lift${s.lifts === 1 ? "" : "s"} · ${s.sets} set${s.sets === 1 ? "" : "s"}`;

/** History (redesign part 3b, §5): how regularly you train, then every session. */
export function HistoryTab({ onEditInLog }: { onEditInLog: (s: WorkoutSession) => void }) {
  const today = useToday();
  const [dayName, setDayName] = useState<string | null>(null);
  // A grid day with two sessions narrows the list to them.
  const [onDay, setOnDay] = useState<GridDay<SessionSummary> | null>(null);
  const [active, setActive] = useState<WorkoutSession | null>(null);

  const { split } = useSplit();
  const { data: historicalNames = [] } = useHistoryDayNames();
  const { sessions, hasMore, loadMore, isPending, isFetchingMore } = useWorkoutHistory(dayName);
  const { grid, isPending: gridPending } = useTrainingGrid(today);
  const aim = split.week.filter((slot) => slot !== "rest").length;

  // Current split labels first, then any retired names still present in the
  // data, so 'Upper A' surfaces without a hardcoded legacy list.
  const chips = historyFilterNames(split.days.map((d) => d.label), historicalNames);
  const chipClass = (on: boolean) =>
    cn(
      "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
      // Tinted, not filled: a filter is a selection within a set.
      on ? "border border-transparent bg-accent/10 text-accent" : "border border-edge text-muted",
    );
  const pick = (name: string | null) => {
    setOnDay(null);
    setDayName(name);
  };
  const openDay = (day: GridDay<SessionSummary>) => {
    if (day.sessions.length === 1) setActive(day.sessions[0]!);
    else setOnDay(day);
  };
  const listed: SessionSummary[] = onDay ? onDay.sessions : sessions;

  return (
    <div className="space-y-4">
      {gridPending ? (
        <Spinner label="Loading your training" />
      ) : grid ? (
        <section aria-label="Last 12 weeks">
          <div className="flex items-baseline justify-between gap-3">
            <div className="figure text-3xl">
              {grid.perWeek.toFixed(1)}
              <span className="ml-1 text-sm font-normal tracking-normal text-muted">a week</span>
            </div>
            <span className="lbl">last 12 weeks · aim {aim}</span>
          </div>
          <TrainingGrid grid={grid} onOpen={openDay} />
        </section>
      ) : (
        <p className="text-sm text-muted">Couldn't load your training.</p>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {onDay ? (
          <button type="button" onClick={() => setOnDay(null)} aria-label={`Show every day, not just ${prettyDate(onDay.date)}`} className={cn(chipClass(true), "inline-flex items-center gap-1")}>
            {prettyDate(onDay.date)}
            <X size={12} aria-hidden="true" />
          </button>
        ) : (
          <>
            <button onClick={() => pick(null)} className={chipClass(dayName === null)}>
              All
            </button>
            {chips.map((name) => (
              <button key={name} onClick={() => pick(name)} className={chipClass(dayName === name)}>
                {name}
              </button>
            ))}
          </>
        )}
      </div>

      {!onDay && isPending && <p className="py-4 text-center text-xs text-muted">Loading…</p>}
      {!onDay && !isPending && sessions.length === 0 && (
        <p className="py-8 text-center text-xs text-muted">No sessions logged yet</p>
      )}

      {listed.length > 0 && (
        <List>
          {listed.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-accent/5"
            >
              <span className="min-w-0 truncate text-sm">
                <span className="tnum">{prettyDate(s.date)}</span>
                <span className="text-muted"> · {s.day_name}</span>
              </span>
              <span className="tnum flex shrink-0 items-center gap-1 text-xs text-muted">
                {counts(s)}
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </button>
          ))}
        </List>
      )}

      {!onDay && hasMore && (
        <button
          onClick={() => void loadMore()}
          disabled={isFetchingMore}
          className="w-full py-3 text-center text-xs text-muted disabled:opacity-50"
        >
          {isFetchingMore ? "Loading…" : "Load more"}
        </button>
      )}

      <SessionDetailSheet session={active} onClose={() => setActive(null)} onEditInLog={onEditInLog} />
    </div>
  );
}
