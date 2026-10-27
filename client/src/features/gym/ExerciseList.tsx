import { useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { List } from "@/components/ui/List";
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
  /** Last time is still loading: the rows must not claim there is none. */
  lastPending?: boolean;
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
  lastPending = false,
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

  // Pointer covers mouse and touch; the keyboard (Space, arrows, Space) keeps
  // reordering open to anyone without either.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (id: string | number) => exercises.find((e) => e.id === id)?.exercise_name ?? "Exercise";

  // reorder takes the FINAL ordering, so a drag is one request on drop, never
  // one per row it passes.
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = exercises.map((e) => e.id);
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const rows = exercises.map((e) => (
    <ExerciseRow
      key={e.id}
      exercise={e}
      lastSets={lastSets[e.exercise_name] ?? []}
      lastPending={lastPending}
      todaySets={byName[e.exercise_name] ?? []}
      editMode={editMode}
      onOpen={() => onOpen(e)}
      onDelete={() => onDelete(e.id)}
      onRename={() => onRename(e.exercise_name)}
    />
  ));

  return (
    <List>
      <div className="flex items-baseline justify-between pt-3 pb-2">
        <span className="lbl">Exercises</span>
        {!editMode && exercises.length > 0 && (
          <span className="tnum lbl text-muted">
            {done} / {exercises.length}
          </span>
        )}
      </div>

      {editMode ? (
        // Vertical and inside the list: a row dragged sideways would reach
        // past the screen's edge, and iOS pans the page for it (CLAUDE.md).
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={drop}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
              onDragOver: ({ active, over }) =>
                over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : `${nameOf(active.id)} is over no position.`,
              onDragEnd: ({ active, over }) =>
                over ? `${nameOf(active.id)} dropped at ${nameOf(over.id)}'s place.` : `${nameOf(active.id)} dropped.`,
              onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} cancelled.`,
            },
          }}
        >
          <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        rows
      )}

      {exercises.length === 0 && !editMode && (
        <p className="py-6 text-center text-sm text-muted">
          No exercises on this day yet. Tap the pencil to add some.
        </p>
      )}

      {editMode && (
        <div className="py-3">
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
    </List>
  );
}
