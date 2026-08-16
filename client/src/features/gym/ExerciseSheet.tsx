import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { setLong } from "@dashboard/shared";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { useCoaching } from "@/hooks/useCoaching";
import { CoachingCard } from "./CoachingCard";
import { cn } from "@/lib/cn";

interface Props {
  exercise: Exercise | null;
  todaySets: WorkoutSet[];
  lastSets: WorkoutSet[];
  onClose: () => void;
  onLogSet: (weightKg: number, reps: number, isBodyweight: boolean, setNumber: number) => void;
  onDeleteSet: (id: string) => void;
}

export function ExerciseSheet({
  exercise,
  todaySets,
  lastSets,
  onClose,
  onLogSet,
  onDeleteSet,
}: Props) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);

  const { data: coaching, isLoading } = useCoaching(exercise?.exercise_name ?? null);

  // Reset on open, not on close — clearing during the exit animation makes the
  // fields visibly blank as the sheet slides away.
  useEffect(() => {
    if (exercise) {
      setWeight("");
      setReps("");
      setIsBodyweight(false);
    }
  }, [exercise]);

  const r = Number.parseInt(reps, 10);
  const w = Number.parseFloat(weight);
  const valid = Number.isFinite(r) && r > 0 && (isBodyweight || (Number.isFinite(w) && w > 0));

  /**
   * Continue from the HIGHEST existing set number, not the count.
   *
   * Delete set 2 of three and a count-based next number is 3 — which collides
   * with the existing set 3 on UNIQUE (session_id, exercise_name, set_number)
   * and silently overwrites it, because the server upserts.
   */
  const nextSetNumber = todaySets.reduce((m, s) => Math.max(m, s.set_number), 0) + 1;

  const submit = () => {
    if (!valid || !exercise) return;
    onLogSet(isBodyweight ? 0 : w, r, isBodyweight, nextSetNumber);
    setWeight("");
    setReps("");
  };

  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.exercise_name ?? ""}>
      <div className="space-y-4">
        <CoachingCard data={coaching} isLoading={isLoading} />

        <div>
          <div className="lbl mb-1.5">Last session</div>
          {lastSets.length === 0 ? (
            <p className="text-xs text-dim">No previous data</p>
          ) : (
            <div className="space-y-0.5">
              {lastSets.map((s) => (
                <div key={s.id} className="text-xs text-muted">
                  Set {s.set_number} · {setLong(s)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="lbl mb-1.5">This session</div>
          {todaySets.length === 0 ? (
            <p className="text-xs text-dim">Nothing logged yet</p>
          ) : (
            <div className="space-y-1">
              {todaySets.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <span className="tnum text-xs text-text">
                    Set {s.set_number} · {setLong(s)}
                  </span>
                  <button
                    onClick={() => onDeleteSet(s.id)}
                    aria-label={`Delete set ${s.set_number}`}
                    className="p-1 text-negative"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setIsBodyweight((v) => !v)}
          aria-pressed={isBodyweight}
          className={cn(
            "w-full rounded-lg border py-2 font-mono text-[10px] uppercase tracking-[0.12em]",
            isBodyweight
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-raised bg-surface text-muted",
          )}
        >
          {isBodyweight ? "Bodyweight ON" : "Mark as bodyweight"}
        </button>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Weight (kg)" htmlFor="set-weight">
              <Input
                id="set-weight"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder={isBodyweight ? "BW" : "80"}
                value={isBodyweight ? "" : weight}
                disabled={isBodyweight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Reps" htmlFor="set-reps">
              <Input
                id="set-reps"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="8"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            </Field>
          </div>
        </div>

        {/* The one accent action in this sheet. */}
        <Button onClick={submit} disabled={!valid} className="w-full">
          {isBodyweight ? `Add BW set ${nextSetNumber}` : `Add set ${nextSetNumber}`}
        </Button>
      </div>
    </Sheet>
  );
}
