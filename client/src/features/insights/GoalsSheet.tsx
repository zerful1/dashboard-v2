import { useState } from "react";
import { X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useGoals } from "@/hooks/useGoals";
import { canonicalName, suggestNames } from "@/lib/exerciseNames";
import { parseDecimal } from "@/lib/number";

const MAX_LIFTS = 5;

/**
 * Setting and changing goals: the forms that used to sit
 * open on the page. It stays open across several changes and closes on Done.
 */
export function GoalsSheet({ open, onClose, historyNames }: { open: boolean; onClose: () => void; historyNames: string[] }) {
  const g = useGoals();
  const [weight, setWeight] = useState("");
  const [lift, setLift] = useState("");
  const [liftKg, setLiftKg] = useState("");

  const weightGoal = g.goals.find((x) => x.kind === "weight");
  const lifts = g.goals.filter((x) => x.kind === "lift");
  const weightValue = parseDecimal(weight);
  const liftValue = parseDecimal(liftKg);
  const suggestions = suggestNames(historyNames, lift, lifts.map((x) => x.exercise_name ?? ""));

  return (
    <Sheet open={open} onClose={onClose} title="Goals">
      <div className="space-y-5">
        <div className="space-y-1">
          {/* Said in words: a placeholder is too faint to carry the current target. */}
          {weightGoal && <p className="text-xs text-muted">Target now {weightGoal.target_kg} kg</p>}
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
            <Button
              variant="ghost"
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
            <div key={x.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{x.exercise_name} → {x.target_kg} kg</span>
              <button aria-label={`Remove ${x.exercise_name} goal`} onClick={() => g.remove.mutate(x.id)} className="p-1 text-muted hover:text-text">
                <X size={14} />
              </button>
            </div>
          ))}
          {lifts.length >= MAX_LIFTS ? (
            <p className="text-xs text-muted">
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
                <Button
                  variant="ghost"
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
                        className="rounded-full border border-edge px-3 py-1 text-xs text-muted hover:text-text"
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

        <Button variant="subtle" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
