import { Check, ChevronDown, Pencil, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS } from "@/lib/focus";
import { DateEyebrow } from "@/components/ui/DateEyebrow";

/**
 * Gym's header: the date as the eyebrow and the
 * day as the title, like Home's, each of them the control that changes it.
 */
export function GymHeader({
  date,
  onDate,
  dayName,
  onPickDay,
  editMode,
  onToggleEdit,
  onEditSplit,
}: {
  date: string;
  onDate: (d: string) => void;
  dayName: string;
  onPickDay: () => void;
  editMode: boolean;
  onToggleEdit: () => void;
  onEditSplit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        {/* Back to today, beside the date, is the warning that sets will land on another day. */}
        <DateEyebrow date={date} onDate={onDate} />
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          <button
            type="button"
            onClick={onPickDay}
            aria-haspopup="dialog"
            aria-label={`Training day: ${dayName}`}
            className={cn("inline-flex max-w-full items-center gap-1.5 rounded-sm text-left", FOCUS)}
          >
            <span className="truncate">{dayName}</span>
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted" />
          </button>
        </h1>
      </div>
      <div className="flex shrink-0">
        <button onClick={onEditSplit} aria-label="Edit split" className="rounded-full p-2 text-muted">
          <SlidersHorizontal size={16} />
        </button>
        <button
          onClick={onToggleEdit}
          aria-label={editMode ? "Done editing" : "Edit exercises"}
          className={cn("rounded-full p-2", editMode ? "bg-accent/10 text-accent" : "text-muted")}
        >
          {editMode ? <Check size={16} /> : <Pencil size={16} />}
        </button>
      </div>
    </div>
  );
}
