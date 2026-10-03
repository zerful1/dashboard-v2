import { useState } from "react";
import { Plus } from "lucide-react";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { canonicalName, suggestNames } from "@/lib/exerciseNames";
import { ExerciseRow } from "./ExerciseRow";

interface Props {
  exercises: Exercise[];
  sets: WorkoutSet[];
  lastSets: Record<string, WorkoutSet[]>;
  editMode: boolean;
  onOpen: (e: Exercise) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onRename: (name: string) => void;
  onAdd: (name: string) => void;
  /** Every exercise name in the user's history, to suggest while adding. */
  historyNames: string[];
}

export function ExerciseList({
  exercises,
  sets,
  lastSets,
  editMode,
  onOpen,
  onDelete,
  onReorder,
  onRename,
  onAdd,
  historyNames,
}: Props) {
  const [newName, setNewName] = useState("");

  // Names from history, so a day's list reuses them exactly: a near-miss like
  // "Machine T Bar Row" for "T Bar Row" would split one exercise's history in two.
  const suggestions = suggestNames(historyNames, newName, exercises.map((e) => e.exercise_name));
  const add = (name: string) => {
    // A phone capitalises as it likes ("T bar row"), and stats match names
    // exactly, so a name that differs from history only in case takes the
    // history's spelling.
    onAdd(canonicalName(historyNames, name));
    setNewName("");
  };

  const byName = sets.reduce<Record<string, WorkoutSet[]>>((acc, s) => {
    (acc[s.exercise_name] ??= []).push(s);
    return acc;
  }, {});
  const done = exercises.filter((e) => (byName[e.exercise_name]?.length ?? 0) > 0).length;

  const move = (index: number, dir: "up" | "down") => {
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    // reorder takes the FINAL ordering, so a nudge is one request whose
    // outcome does not depend on how many nudges preceded it.
    onReorder(ids);
  };

  return (
    <div className="overflow-hidden rounded-card border border-raised bg-surface">
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <span className="lbl">Exercises</span>
        {!editMode && exercises.length > 0 && (
          <span className="tnum lbl text-dim">
            {done} / {exercises.length}
          </span>
        )}
      </div>

      {exercises.map((e, i) => (
        <ExerciseRow
          key={e.id}
          exercise={e}
          lastSets={lastSets[e.exercise_name] ?? []}
          todaySets={byName[e.exercise_name] ?? []}
          editMode={editMode}
          isFirst={i === 0}
          isLast={i === exercises.length - 1}
          onOpen={() => onOpen(e)}
          onDelete={() => onDelete(e.id)}
          onMove={(dir) => move(i, dir)}
          onRename={() => onRename(e.exercise_name)}
        />
      ))}

      {exercises.length === 0 && !editMode && (
        <p className="border-t border-raised px-4 py-6 text-center text-sm text-dim">
          No exercises on this day yet. Tap the pencil to add some.
        </p>
      )}

      {editMode && (
        <div className="border-t border-raised px-4 py-3">
          <div className="flex gap-2">
            <Input
              placeholder="Exercise name"
              value={newName}
              aria-label="New exercise name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) add(newName.trim());
              }}
            />
            <Button disabled={!newName.trim()} onClick={() => add(newName.trim())} aria-label="Add exercise">
              <Plus size={14} />
            </Button>
          </div>
          {suggestions.length > 0 && (
            <ul aria-label="Suggestions" className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((n) => (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => add(n)}
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
  );
}
