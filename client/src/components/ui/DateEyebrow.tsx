import { ChevronDown } from "lucide-react";
import { toLocalISO } from "@dashboard/shared";
import { longDate } from "@/lib/dates";
import { FOCUS } from "@/lib/focus";
import { cn } from "@/lib/cn";

/**
 * A page's date as its eyebrow, and the control that changes it (Gym, Food).
 * "Back to today" sits beside it whenever the date is not today.
 */
export function DateEyebrow({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  const today = toLocalISO();
  return (
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
  );
}
