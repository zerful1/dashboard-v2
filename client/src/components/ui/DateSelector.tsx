import { Calendar } from "lucide-react";
import { toLocalISO } from "@dashboard/shared";
import { cn } from "@/lib/cn";
import { prettyDate } from "@/lib/dates";

function label(value: string, today: string): string {
  if (value === today) return "Today";
  return prettyDate(value);
}

/** A native date input laid transparently over a chip; it must stay directly tappable, as iOS rejects showPicker(). */
export function DateSelector({
  value,
  onChange,
  today: pageToday,
}: {
  value: string;
  onChange: (d: string) => void;
  /** The page's today (CLAUDE.md, one clock per page). Without it, the clock's. */
  today?: string;
}) {
  const today = pageToday ?? toLocalISO();

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1.5 text-xs text-muted",
        // The input is opacity-0, which hides its own ring, so keyboard focus shows on the chip instead.
        "has-[:focus-visible]:outline-hidden has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg",
      )}
    >
      {/* Decorative: the input below carries the accessible name. */}
      <Calendar size={13} className="text-accent" aria-hidden="true" />
      <span aria-hidden="true">{label(value, today)}</span>
      <input
        type="date"
        value={value}
        max={today}
        aria-label={`Change date — currently ${label(value, today)}`}
        onChange={(e) => {
          // A cleared picker fires a change with ""; ignore it so an empty value never reaches the API.
          if (e.target.value) onChange(e.target.value);
        }}
        // Transparent, on top, full size so it receives the tap; NOT pointer-events-none.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
