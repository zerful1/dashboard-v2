import { Check, ChevronRight, Trash2, ChevronUp, ChevronDown } from "lucide-react";
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
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onRename: () => void;
}

export function ExerciseRow({
  exercise,
  lastSets,
  todaySets,
  editMode,
  isFirst,
  isLast,
  onOpen,
  onDelete,
  onMove,
  onRename,
}: Props) {
  if (editMode) {
    return (
      <div className="flex items-center gap-2 py-3">
        <div className="flex shrink-0 flex-col">
          <button
            onClick={() => onMove("up")}
            disabled={isFirst}
            aria-label="Move up"
            className="p-0.5 text-muted disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove("down")}
            disabled={isLast}
            aria-label="Move down"
            className="p-0.5 text-muted disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
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

  const done = todaySets.length > 0;
  const top = done ? topSet(todaySets) : topSet(lastSets);
  const meta = done
    ? `${todaySets.length} set${todaySets.length === 1 ? "" : "s"}${top ? ` · top ${setLong(top)}` : ""}`
    : top
      ? `Last · ${setLong(top)}`
      : "No history";

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/5"
    >
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border",
          done ? "border-accent bg-accent" : "border-raised",
        )}
      >
        {done && <Check size={11} strokeWidth={3} className="text-bg" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", done ? "text-muted" : "text-text")}>
          {exercise.exercise_name}
        </span>
        <span className="lbl mt-0.5 block normal-case tracking-normal text-dim">{meta}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-dim" />
    </button>
  );
}
