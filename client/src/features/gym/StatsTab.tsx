import { useEffect, useState } from "react";
import { useExerciseStats, useHistoryExerciseNames } from "@/hooks/useExerciseStats";
import { StatCards } from "./StatCards";
import { ProgressionChart } from "./ProgressionChart";
import { Spinner } from "@/components/ui/Spinner";

export function StatsTab() {
  const { data: names = [], isLoading: namesLoading } = useHistoryExerciseNames();
  const [selected, setSelected] = useState<string | null>(null);

  // Default to the first name once they arrive, but never overwrite a choice.
  useEffect(() => {
    if (!selected && names.length > 0) setSelected(names[0]!);
  }, [names, selected]);

  const { stats, isLoading } = useExerciseStats(selected);

  if (namesLoading) return <Spinner label="Loading exercises" />;

  if (names.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted">
        Log some sets and your stats will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="stats-exercise" className="lbl">
          Exercise
        </label>
        <select
          id="stats-exercise"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {/* From history, not the template — exercises you have stopped doing
              stay reachable, and they are often the interesting ones. */}
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {isLoading || !stats ? (
        <Spinner label="Loading stats" />
      ) : (
        <>
          <StatCards stats={stats} />
          <ProgressionChart
            chartData={stats.chartData}
            bodyweightOnly={stats.isBodyweightOnly}
          />
        </>
      )}
    </div>
  );
}
