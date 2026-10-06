import { useMemo, useState } from "react";
import { toLocalISO } from "@dashboard/shared";
import type { BodyWeightEntry } from "@dashboard/shared";
import { useWeights } from "@/hooks/useWeights";
import { useWeightGoalKg } from "@/hooks/useGoals";
import { deriveWeightSummary } from "./deriveWeight";
import { WeightChart } from "./WeightChart";
import { WeightStats } from "./WeightStats";
import { WeightList } from "./WeightList";
import { LogWeightCard } from "./LogWeightCard";
import { EditWeightSheet } from "./EditWeightSheet";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";

export function WeightPage() {
  // isPending, not isLoading: while auth resolves the query is DISABLED, and a
  // disabled query reports isLoading false - so the page would paint "No
  // entries yet" over a history that simply had not arrived. Same defect as
  // the one fixed in useHomeDay, in the smaller of the two places.
  const { entries, isPending, isError, saveWeight, deleteWeight } = useWeights();
  const goalKg = useWeightGoalKg();
  const [editing, setEditing] = useState<BodyWeightEntry | null>(null);

  const today = toLocalISO();
  const summary = useMemo(() => deriveWeightSummary(entries, today), [entries, today]);

  if (isPending) return <Spinner label="Loading your weight history" />;

  // Distinguished from empty: a failed fetch must not read as "no data yet".
  // Someone with ten months of history seeing "No entries" would reasonably
  // conclude it had been lost.
  if (isError) {
    return (
      <Card>
        <div className="lbl text-negative">Could not load</div>
        <p className="mt-2 text-sm text-muted">
          Your weight history could not be fetched. Check your connection and retry.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Weight</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Body weight</h1>
      </div>

      <LogWeightCard save={saveWeight} entries={entries} />
      <WeightStats summary={summary} goalKg={goalKg} />
      <WeightChart points={summary.points} trend={summary.trend} goalKg={goalKg} />
      <WeightList entries={entries} onSelect={setEditing} />

      <EditWeightSheet
        entry={editing}
        onClose={() => setEditing(null)}
        save={saveWeight}
        remove={deleteWeight}
      />
    </div>
  );
}
