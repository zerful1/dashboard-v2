import { useState } from "react";
import { useOpenParam } from "@/hooks/useOpenParam";
import type { Goal, Projection } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useGoals, useProjections } from "@/hooks/useGoals";
import { projectionText } from "./projectionText";
import { GoalsSheet } from "./GoalsSheet";

function GoalRow({ goal, projection, today }: { goal: Goal; projection?: Projection; today: string }) {
  const title = goal.kind === "weight" ? `Weight → ${goal.target_kg} kg` : `${goal.exercise_name} → ${goal.target_kg} kg`;
  return (
    <div className="py-2.5">
      <div className="text-sm font-semibold">{title}</div>
      <div className="tnum text-xs text-muted">{projection ? projectionText(projection, goal.kind, today) : "…"}</div>
    </div>
  );
}

/** Each goal with when it is reached; the forms live behind Change (redesign part 6, §5). */
export function GoalsSection({ today, historyNames }: { today: string; historyNames: string[] }) {
  const g = useGoals();
  const projections = useProjections(today);
  const [open, setOpen] = useState(false);
  useOpenParam("goals", () => setOpen(true));
  const byGoal = new Map((projections.data ?? []).map((p) => [p.goalId, p]));
  const weightGoal = g.goals.find((x) => x.kind === "weight");
  const lifts = g.goals.filter((x) => x.kind === "lift");

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="lbl">Goals</h2>
        {g.hasData && (
          // min-h-6: a tap area of 24 px, where the padding is zeroed to sit in the heading's line.
          <Button variant="subtle" className="min-h-6 px-0 py-0 text-sm" onClick={() => setOpen(true)}>
            {g.goals.length ? "Change" : "Set goals"}
          </Button>
        )}
      </div>
      {!g.hasData ? (
        g.isError ? (
          <div className="mt-3">
            <p className="text-sm text-negative">Could not load goals</p>
            <Button variant="ghost" className="mt-2" onClick={() => void g.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Spinner label="Loading goals" />
        )
      ) : (
        <div className="mt-1">
          {projections.isError && !projections.data && (
            // The projections query opts out of the toast, so its failure is said here.
            <div className="flex items-center justify-between gap-2 py-2">
              <p className="text-sm text-negative">Couldn't load projections</p>
              <Button variant="ghost" onClick={() => void projections.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {g.goals.length === 0 && <p className="py-2 text-sm text-muted">No goals yet.</p>}
          {weightGoal && <GoalRow goal={weightGoal} projection={byGoal.get(weightGoal.id)} today={today} />}
          {lifts.map((x) => (
            <GoalRow key={x.id} goal={x} projection={byGoal.get(x.id)} today={today} />
          ))}
        </div>
      )}
      <GoalsSheet open={open} onClose={() => setOpen(false)} historyNames={historyNames} />
    </Card>
  );
}
