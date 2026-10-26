import { Check, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setLong } from "@dashboard/shared";
import type { Exercise, WorkoutSet } from "@dashboard/shared";
import { cn } from "@/lib/cn";

function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  if (sets.length === 0) return null;
  // Bodyweight sets are excluded from weight comparison — their weight is
  // forced to 0, so comparing by it would always pick a weighted set even when
  // the bodyweight one was the harder effort. Among bodyweight-only sets the
  // most reps is the top set instead.
  const weighted = sets.filter((s) => !s.is_bodyweight);
  return weighted.length
    ? weighted.reduce((best, s) => (s.weight_kg > best.weight_kg ? s : best), weighted[0]!)
    : sets.reduce((best, s) => (s.reps > best.reps ? s : best), sets[0]!);
}

interface Props {
  exercise: Exercise;
  lastSets: WorkoutSet[];
  todaySets: WorkoutSet[];
  editMode: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
  /** Last time is still loading: say nothing rather than "No history". */
  lastPending?: boolean;
}

export function ExerciseRow({
  exercise,
  lastSets,
  todaySets,
  editMode,
  onOpen,
  onDelete,
  onRename,
  lastPending = false,
}: Props) {
  if (editMode) return <EditRow exercise={exercise} onDelete={onDelete} onRename={onRename} />;

  const done = todaySets.length > 0;
  const top = done ? topSet(todaySets) : topSet(lastSets);
  const meta = done
    ? `${todaySets.length} set${todaySets.length === 1 ? "" : "s"}${top ? ` · top ${setLong(top)}` : ""}`
    : top
      ? `Last · ${setLong(top)}`
      : lastPending
        ? " " // keeps the row's height while last time loads
        : "No history";

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/5"
    >
      <span
        data-part="mark"
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border",
          done ? "border-accent bg-accent" : "border-dim",
        )}
      >
        {done && <Check size={11} strokeWidth={3} className="text-bg" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", done ? "text-muted" : "text-text")}>
          {exercise.exercise_name}
        </span>
        <span className="lbl mt-0.5 block text-muted">{meta}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-dim" />
    </button>
  );
}

/**
 * A row in edit mode, dragged by its grip inside ExerciseList's DndContext.
 * The grip alone starts a drag, and takes `touch-action: none`, so on a phone
 * a touch anywhere else still scrolls the page.
 */
function EditRow({ exercise, onDelete, onRename }: Pick<Props, "exercise" | "onDelete" | "onRename">) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.id });
  return (
    <div
      ref={setNodeRef}
      data-exercise-row
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center gap-2 py-3", isDragging && "relative z-10 bg-bg")}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${exercise.exercise_name}`}
        className="shrink-0 cursor-grab touch-none p-1 text-muted active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>
      {/* Dotted underline signals the name is editable without a second control. */}
      <button
        onClick={onRename}
        className="min-w-0 flex-1 truncate text-left text-sm underline decoration-muted decoration-dotted underline-offset-4"
      >
        {exercise.exercise_name}
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete ${exercise.exercise_name}`}
        className="shrink-0 p-1 text-negative"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
