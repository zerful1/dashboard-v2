import { useState } from "react";
import { X } from "lucide-react";
import type { Goal, Projection } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useGoals, useProjections } from "@/hooks/useGoals";
import { canonicalName, suggestNames } from "@/lib/exerciseNames";
import { parseDecimal } from "@/lib/number";
import { projectionText } from "./projectionText";

const MAX_LIFTS = 5;

function GoalRow({
  goal,
  projection,
  today,
  onRemove,
}: {
  goal: Goal;
  projection?: Projection;
  today: string;
  onRemove?: () => void;
}) {
  const title = goal.kind === "weight" ? `Weight → ${goal.target_kg} kg` : `${goal.exercise_name} → ${goal.target_kg} kg`;
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="tnum text-xs text-muted">{projection ? projectionText(projection, goal.kind, today) : "…"}</div>
      </div>
      {onRemove && (
        <button aria-label={`Remove ${goal.exercise_name} goal`} onClick={onRemove} className="p-1 text-muted hover:text-text">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function GoalsSection({ today, historyNames }: { today: string; historyNames: string[] }) {
  const g = useGoals();
  const projections = useProjections(today);
  const [weight, setWeight] = useState("");
  const [lift, setLift] = useState("");
  const [liftKg, setLiftKg] = useState("");

  const byGoal = new Map((projections.data ?? []).map((p) => [p.goalId, p]));
  const weightGoal = g.goals.find((x) => x.kind === "weight");
  const lifts = g.goals.filter((x) => x.kind === "lift");
  const weightValue = parseDecimal(weight);
  const liftValue = parseDecimal(liftKg);
  const suggestions = suggestNames(historyNames, lift, lifts.map((x) => x.exercise_name ?? ""));

  if (!g.hasData) {
    return (
      <Card>
        <div className="lbl">Goals</div>
        {g.isError ? (
          <div className="mt-3">
            <p className="text-sm text-negative">Could not load goals</p>
            <Button variant="ghost" className="mt-2" onClick={() => void g.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Spinner label="Loading goals" />
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="lbl">Goals</div>
      <div className="mt-3 space-y-4">
        <div className="space-y-2">
          {weightGoal && <GoalRow goal={weightGoal} projection={byGoal.get(weightGoal.id)} today={today} />}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Target weight (kg)" htmlFor="goal-weight">
                <Input
                  id="goal-weight"
                  inputMode="decimal"
                  value={weight}
                  placeholder={weightGoal ? String(weightGoal.target_kg) : "75"}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
            </div>
            {/* This form's one filled action. */}
            <Button
              disabled={weightValue === null || weightValue <= 0}
              onClick={() => {
                if (weightValue) g.setWeight.mutate(weightValue, { onSuccess: () => setWeight("") });
              }}
            >
              Save
            </Button>
            {weightGoal && (
              <Button variant="ghost" onClick={() => g.remove.mutate(weightGoal.id)}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {lifts.map((x) => (
            <GoalRow key={x.id} goal={x} projection={byGoal.get(x.id)} today={today} onRemove={() => g.remove.mutate(x.id)} />
          ))}
          {lifts.length >= MAX_LIFTS ? (
            <p className="text-xs text-dim">
              {MAX_LIFTS} of {MAX_LIFTS} lift goals
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Lift" htmlFor="goal-lift">
                    <Input id="goal-lift" value={lift} placeholder="Lat Pulldown" onChange={(e) => setLift(e.target.value)} />
                  </Field>
                </div>
                <div className="w-24">
                  <Field label="Target (kg)" htmlFor="goal-lift-kg">
                    <Input id="goal-lift-kg" inputMode="decimal" value={liftKg} onChange={(e) => setLiftKg(e.target.value)} />
                  </Field>
                </div>
                {/* This form's one filled action. */}
                <Button
                  disabled={!lift.trim() || liftValue === null || liftValue <= 0}
                  onClick={() => {
                    if (!liftValue) return;
                    g.addLift.mutate(
                      { exercise_name: canonicalName(historyNames, lift.trim()), target_kg: liftValue },
                      {
                        onSuccess: () => {
                          setLift("");
                          setLiftKg("");
                        },
                      },
                    );
                  }}
                >
                  Add
                </Button>
              </div>
              {suggestions.length > 0 && (
                <ul aria-label="Suggestions" className="flex flex-wrap gap-1.5">
                  {suggestions.map((n) => (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() => setLift(n)}
                        className="rounded-full border border-raised px-3 py-1 text-xs text-muted hover:text-text"
                      >
                        {n}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
