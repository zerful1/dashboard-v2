import { useEffect, useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { lastTimeRows, setCell, sheetDefaults } from "@dashboard/shared";
import type { Exercise, LastTime, WorkoutSet } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { useCoaching } from "@/hooks/useCoaching";
import { prettyDate } from "@/lib/dates";
import { CoachingCard } from "./CoachingCard";
import { cn } from "@/lib/cn";

interface Props {
  exercise: Exercise | null;
  todaySets: WorkoutSet[];
  /** The last time this exercise was done, on any day (redesign part 3a, §4). */
  last: LastTime | null;
  /** Last time is still loading: claim nothing about it until it has. */
  lastPending?: boolean;
  onClose: () => void;
  onLogSet: (
    weightKg: number,
    reps: number | { left: number; right: number },
    isBodyweight: boolean,
    setNumber: number,
  ) => void;
  onDeleteSet: (id: string) => void;
}

const NO_SETS: WorkoutSet[] = [];

/**
 * Logging one exercise (redesign part 3a, §3): today against last time, set by
 * set, with the set being logged as a highlighted block between them.
 */
export function ExerciseSheet({ exercise, todaySets, last, lastPending = false, onClose, onLogSet, onDeleteSet }: Props) {
  const lastSets = last?.sets ?? NO_SETS;
  const rows = lastTimeRows(todaySets, lastSets);
  const defaults = sheetDefaults(todaySets, lastSets, rows.next);

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [sides, setSides] = useState(false);
  // Once the user flips a switch, data arriving later does not overrule them.
  const sidesTouched = useRef(false);
  const bodyweightTouched = useRef(false);
  const nextBlock = useRef<HTMLDivElement>(null);
  const nextId = useId();

  const { data: coaching, isLoading } = useCoaching(exercise?.exercise_name ?? null);

  // The user's rule (2026-10-03): on for a "Unilateral …" name, or when last
  // time was logged per side; the switch overrides it either way. Today's sets
  // count too, so reopening the sheet mid-workout keeps the choice made.
  const sidedByDefault =
    !!exercise &&
    (/unilateral/i.test(exercise.exercise_name) ||
      lastSets.some((s) => s.reps_left !== null) ||
      todaySets.some((s) => s.reps_left !== null));

  // Reset on open, not on close: clearing during the exit animation makes the
  // fields visibly blank as the sheet slides away. Only on open, because
  // `defaults` moves with every set logged and must never overwrite typing.
  useEffect(() => {
    if (exercise) {
      setWeight(defaults.weight);
      setReps("");
      setLeft("");
      setRight("");
      sidesTouched.current = false;
      bodyweightTouched.current = false;
    }
  }, [exercise]);

  // Separate from the reset: last time can arrive after the sheet opens, and
  // the switches follow it until touched.
  useEffect(() => {
    if (exercise && !sidesTouched.current) setSides(sidedByDefault);
  }, [exercise, sidedByDefault]);

  useEffect(() => {
    if (exercise && !bodyweightTouched.current) setIsBodyweight(defaults.bodyweight);
  }, [exercise, defaults.bodyweight]);

  // The set being logged stays in view on a long session: on open, and after
  // each Add set moves it down. Optional call: jsdom has no scrollIntoView.
  useEffect(() => {
    if (exercise) nextBlock.current?.scrollIntoView?.({ block: "nearest" });
  }, [exercise, rows.next]);

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

  const submit = () => {
    if (!valid || !exercise) return;
    onLogSet(isBodyweight ? 0 : w, sides ? { left: l!, right: rt! } : r!, isBodyweight, rows.next);
    // The weight stays for the next set. The reps clear, so a stray tap cannot
    // log this set twice: Add set waits for new ones.
    setReps("");
    setLeft("");
    setRight("");
  };

  // Until last time has loaded the sheet claims nothing about it (CLAUDE.md,
  // isPending not isLoading): "not loaded yet" is not "never done".
  const first = !lastPending && !last && todaySets.length === 0;
  const showHeader = !!last || rows.above.length > 0;

  // One column plan for both tables, so the rows below the block line up with
  // the rows above it.
  const columns = (
    <colgroup>
      <col className="w-[18%]" />
      {last && <col />}
      <col />
      <col className="w-8" />
    </colgroup>
  );

  const nextSet = (
    // A tint, not a box: the set being logged is the selected item.
    <div ref={nextBlock} role="group" aria-labelledby={nextId} className="rounded-xl bg-accent/5 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span id={nextId} className="text-sm font-semibold">
          Set {rows.next}
        </span>
        <span className="tnum text-xs text-muted">
          {rows.nextLast ? (
            <>
              Last time <span className="font-semibold text-text">{setCell(rows.nextLast)}</span>
            </>
          ) : lastPending ? null : last ? (
            `No set ${rows.next} last time`
          ) : (
            "No last time"
          )}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="flex-1">
          <Field label="Weight (kg)" htmlFor="set-weight">
            <Input
              id="set-weight"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder={isBodyweight ? "BW" : (defaults.weightHint ?? "kg")}
              value={isBodyweight ? "" : weight}
              disabled={isBodyweight}
              onChange={(e) => {
                // Typing a weight is a choice: a bodyweight last time that
                // arrives late must not blank and disable it.
                bodyweightTouched.current = true;
                setWeight(e.target.value);
              }}
            />
          </Field>
        </div>
        {sides ? (
          <>
            <div className="flex-1">
              <Field label="Left" htmlFor="set-left">
                <Input id="set-left" type="number" inputMode="numeric" min="1"
                  placeholder={defaults.leftHint ?? "L"} value={left} onChange={(e) => setLeft(e.target.value)} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Right" htmlFor="set-right">
                <Input id="set-right" type="number" inputMode="numeric" min="1"
                  placeholder={defaults.rightHint ?? "R"} value={right} onChange={(e) => setRight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              </Field>
            </div>
          </>
        ) : (
          <div className="flex-1">
            <Field label="Reps" htmlFor="set-reps">
              <Input id="set-reps" type="number" inputMode="numeric" min="1"
                placeholder={defaults.repsHint ?? "reps"} value={reps} onChange={(e) => setReps(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.exercise_name ?? ""}>
      {/* The body scrolls on a long session; the next-set block is kept in view. */}
      <div className="max-h-[70vh] space-y-4 overflow-y-auto overscroll-contain">
        <CoachingCard data={coaching} isLoading={isLoading} />

        {/* The block keeps one place in the tree whatever loads around it, so
            last time arriving never rebuilds the inputs under a thumb. */}
        <div className="space-y-2">
          {first && <p className="text-xs text-muted">First time on this one. Nothing to compare yet.</p>}
          {showHeader && (
            <table className="w-full table-fixed border-collapse text-[13px]">
              {columns}
              <thead>
                <tr>
                  <th scope="col" className="pb-1.5 text-left">
                    <span className="sr-only">Set</span>
                  </th>
                  {last && (
                    <th scope="col" className="pb-1.5 text-left font-normal">
                      <span className="lbl">Last · {prettyDate(last.date)}</span>
                    </th>
                  )}
                  <th scope="col" className="pb-1.5 text-left font-normal">
                    <span className="lbl">Today</span>
                  </th>
                  <th scope="col">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.above.map((row) => (
                  <tr key={row.n} className="border-t border-raised">
                    <th scope="row" className="py-2 text-left font-normal text-muted">
                      Set {row.n}
                    </th>
                    {last && <td className="tnum py-2 text-muted">{row.last ? setCell(row.last) : "—"}</td>}
                    <td className={cn("tnum py-2", row.today ? "text-text" : "text-muted")}>
                      {row.today ? setCell(row.today) : "—"}
                    </td>
                    <td className="py-2 text-right">
                    {row.today && (
                      <button
                        onClick={() => onDeleteSet(row.today!.id)}
                        aria-label={`Delete set ${row.n}`}
                        className="p-1 text-negative"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {nextSet}
          {rows.below.length > 0 && (
            <table className="w-full table-fixed border-collapse text-[13px]">
              {columns}
              <tbody>
                {rows.below.map((s) => (
                  <tr key={s.set_number} className="border-t border-raised">
                    <th scope="row" className="py-2 text-left font-normal text-muted">
                      Set {s.set_number}
                    </th>
                    <td className="tnum py-2 text-muted">{setCell(s)}</td>
                    <td className="py-2 text-muted">—</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              bodyweightTouched.current = true;
              setIsBodyweight((v) => !v);
            }}
            aria-pressed={isBodyweight}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium",
              isBodyweight ? "border border-transparent bg-accent/10 text-accent" : "border border-edge text-muted",
            )}
          >
            {isBodyweight ? "Bodyweight: on" : "Mark as bodyweight"}
          </button>
          <button
            onClick={() => {
              sidesTouched.current = true;
              setSides((v) => !v);
            }}
            aria-pressed={sides}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium",
              sides ? "border border-transparent bg-accent/10 text-accent" : "border border-edge text-muted",
            )}
          >
            {sides ? "Left / right: on" : "Left / right"}
          </button>
        </div>

        {/* The one white action in this sheet. */}
        <Button onClick={submit} disabled={!valid} className="w-full">
          {isBodyweight ? `Add BW set ${rows.next}` : `Add set ${rows.next}`}
        </Button>
      </div>
    </Sheet>
  );
}
