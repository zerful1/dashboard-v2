import { useState } from "react";
import { Plus } from "lucide-react";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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
}: Props) {
  const [newName, setNewName] = useState("");

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
        <div className="flex gap-2 border-t border-raised px-4 py-3">
          <Input
            placeholder="Exercise name"
            value={newName}
            aria-label="New exercise name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                onAdd(newName.trim());
                setNewName("");
              }
            }}
          />
          <Button
            disabled={!newName.trim()}
            onClick={() => {
              onAdd(newName.trim());
              setNewName("");
            }}
            aria-label="Add exercise"
          >
            <Plus size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
