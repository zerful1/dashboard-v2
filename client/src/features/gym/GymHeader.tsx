import { Check, ChevronDown, Pencil, SlidersHorizontal } from "lucide-react";
import { toLocalISO } from "@dashboard/shared";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

const FOCUS =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/**
 * Gym's header (redesign part 3a, layout B): the date as the eyebrow and the
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
  const today = toLocalISO();

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {/* The input IS the control, transparent over the text: on iOS only a
              direct tap opens the picker (DateSelector explains). */}
          <span className="relative inline-flex items-center gap-1 rounded-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg">
            <span aria-hidden="true" className="lbl text-accent">
              {longDate(date)}
            </span>
            <ChevronDown size={12} aria-hidden="true" className="text-muted" />
            <input
              type="date"
              value={date}
              max={today}
              aria-label={`Change date — currently ${date === today ? "today" : longDate(date)}`}
              onChange={(e) => {
                // A cleared picker fires a change with "". Ignore it.
                if (e.target.value) onDate(e.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
          {/* The warning that sets will land on another day. */}
          {date !== today && (
            <button
              type="button"
              onClick={() => onDate(today)}
              className={cn("lbl text-muted underline underline-offset-4 hover:text-text", FOCUS)}
            >
              Back to today
            </button>
          )}
        </div>
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
