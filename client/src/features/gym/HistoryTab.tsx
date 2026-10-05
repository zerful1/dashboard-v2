import { useState } from "react";
import { historyFilterNames } from "@dashboard/shared";
import type { WorkoutSession } from "@dashboard/shared";
import { useSplit } from "@/hooks/useSplit";
import { useWorkoutHistory, useHistoryDayNames } from "@/hooks/useWorkoutHistory";
import { SessionDetailSheet } from "./SessionDetailSheet";
import { List } from "@/components/ui/List";
import { cn } from "@/lib/cn";

export function HistoryTab({ onEditInLog }: { onEditInLog: (s: WorkoutSession) => void }) {
  const [dayName, setDayName] = useState<string | null>(null);
  const [active, setActive] = useState<WorkoutSession | null>(null);

  const { split } = useSplit();
  const { data: historicalNames = [] } = useHistoryDayNames();
  const { sessions, hasMore, loadMore, isPending, isFetchingMore } = useWorkoutHistory(dayName);

  // Current split labels first, then any retired names still present in the
  // data — so 'Upper A' surfaces without a hardcoded legacy list.
  const chips = historyFilterNames(
    split.days.map((d) => d.label),
    historicalNames,
  );

  const chipClass = (activeChip: boolean) =>
    cn(
      "shrink-0 rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
      // Tinted, not filled: a filter is a selection within a set.
      activeChip ? "bg-accent/10 text-accent" : "border border-raised bg-surface text-muted",
    );

  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button onClick={() => setDayName(null)} className={chipClass(dayName === null)}>
          All
        </button>
        {chips.map((name) => (
          <button key={name} onClick={() => setDayName(name)} className={chipClass(dayName === name)}>
            {name}
          </button>
        ))}
      </div>

      {isPending && <p className="py-4 text-center text-xs text-dim">Loading…</p>}
      {!isPending && sessions.length === 0 && (
        <p className="py-8 text-center text-xs text-dim">No sessions logged yet</p>
      )}

      {sessions.length > 0 && (
        <List>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              className="w-full py-3 text-left hover:bg-accent/5"
            >
              <span className="text-sm font-semibold text-text">{s.date}</span>
              <span className="ml-2 text-sm text-muted">— {s.day_name}</span>
            </button>
          ))}
        </List>
      )}

      {hasMore && (
        <button
          onClick={() => void loadMore()}
          disabled={isFetchingMore}
          className="w-full py-3 text-center text-xs text-muted disabled:opacity-50"
        >
          {isFetchingMore ? "Loading…" : "Load more"}
        </button>
      )}

      <SessionDetailSheet
        session={active}
        onClose={() => setActive(null)}
        onEditInLog={onEditInLog}
      />
    </div>
  );
}
