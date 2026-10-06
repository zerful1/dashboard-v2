import { useEffect, useRef, useState } from "react";
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
  onLogSet: (
    weightKg: number,
    reps: number | { left: number; right: number },
    isBodyweight: boolean,
    setNumber: number,
  ) => void;
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
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [sides, setSides] = useState(false);
  // Once the user flips the switch, data arriving later does not overrule them.
  const touched = useRef(false);

  const { data: coaching, isLoading } = useCoaching(exercise?.exercise_name ?? null);

  // The user's rule (2026-10-03): on for a "Unilateral …" name, or when last
  // session was logged per side; the switch overrides it either way. Today's
  // sets count too, so reopening the sheet mid-workout keeps the choice made.
  const sidedByDefault =
    !!exercise &&
    (/unilateral/i.test(exercise.exercise_name) ||
      lastSets.some((s) => s.reps_left !== null) ||
      todaySets.some((s) => s.reps_left !== null));

  // Reset on open, not on close — clearing during the exit animation makes the
  // fields visibly blank as the sheet slides away.
  useEffect(() => {
    if (exercise) {
      setWeight("");
      setReps("");
      setLeft("");
      setRight("");
      setIsBodyweight(false);
      touched.current = false;
    }
  }, [exercise]);

  // Separate from the reset: last session's sets can arrive after the sheet
  // opens, and the default should follow them until the switch is touched.
  useEffect(() => {
    if (exercise && !touched.current) setSides(sidedByDefault);
  }, [exercise, sidedByDefault]);

  const whole = (v: string) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const r = whole(reps);
  const l = whole(left);
  const rt = whole(right);
  const w = Number.parseFloat(weight);
  const weightOk = isBodyweight || (Number.isFinite(w) && w > 0);
  const valid = weightOk && (sides ? l !== null && rt !== null : r !== null);

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
    onLogSet(isBodyweight ? 0 : w, sides ? { left: l!, right: rt! } : r!, isBodyweight, nextSetNumber);
    setWeight("");
    setReps("");
    setLeft("");
    setRight("");
  };

  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.exercise_name ?? ""}>
      <div className="space-y-4">
        <CoachingCard data={coaching} isLoading={isLoading} />

        <div>
          <div className="lbl mb-1.5">Last session</div>
          {lastSets.length === 0 ? (
            <p className="text-xs text-muted">No previous data</p>
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
            <p className="text-xs text-muted">Nothing logged yet</p>
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

        <div className="flex gap-2">
          <button
            onClick={() => setIsBodyweight((v) => !v)}
            aria-pressed={isBodyweight}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium",
              isBodyweight
                ? "bg-accent/10 text-accent"
                : "border border-edge text-muted",
            )}
          >
            {isBodyweight ? "Bodyweight: on" : "Mark as bodyweight"}
          </button>
          <button
            onClick={() => {
              touched.current = true;
              setSides((v) => !v);
            }}
            aria-pressed={sides}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium",
              sides ? "bg-accent/10 text-accent" : "border border-edge text-muted",
            )}
          >
            {sides ? "Left / right: on" : "Left / right"}
          </button>
        </div>

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
          {sides ? (
            <>
              <div className="flex-1">
                <Field label="Left" htmlFor="set-left">
                  <Input
                    id="set-left"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    placeholder="8"
                    value={left}
                    onChange={(e) => setLeft(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Right" htmlFor="set-right">
                  <Input
                    id="set-right"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    placeholder="8"
                    value={right}
                    onChange={(e) => setRight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit();
                    }}
                  />
                </Field>
              </div>
            </>
          ) : (
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
          )}
        </div>

        {/* The one accent action in this sheet. */}
        <Button onClick={submit} disabled={!valid} className="w-full">
          {isBodyweight ? `Add BW set ${nextSetNumber}` : `Add set ${nextSetNumber}`}
        </Button>
      </div>
    </Sheet>
  );
}
