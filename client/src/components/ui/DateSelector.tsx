import { Calendar } from "lucide-react";
import { toLocalISO } from "@dashboard/shared";
import { cn } from "@/lib/cn";
import { prettyDate } from "@/lib/dates";

function label(value: string, today: string): string {
  if (value === today) return "Today";
  return prettyDate(value);
}

/**
 * A native <input type="date"> laid transparently over a styled chip.
 *
 * The INPUT is the control, and it must stay directly tappable. An earlier
 * version wrapped it in a <button> with pointer-events-none and opened it with
 * showPicker() — which did nothing on iOS, silently. iOS Safari throws
 * NotSupportedError from showPicker() for date inputs; the only thing that
 * opens its picker is a user tap or focus on the input itself, and that was
 * the one path blocked. Desktop Chrome opens its picker on click of the input
 * too, so nothing is lost by dropping showPicker entirely.
 *
 * Nested interactive content (<input> inside <button>) is also invalid HTML,
 * which iOS was the first to punish.
 */
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
        // The input is opacity-0, and opacity hides an element's own outline
        // and ring along with it — so keyboard focus is shown on the chip
        // instead, and only for keyboard focus, matching Button.
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
          // A cleared picker fires a change with "". Ignore it rather than
          // wipe the date, or an empty value reaches the API.
          if (e.target.value) onChange(e.target.value);
        }}
        // Transparent, on top, full size: it receives the tap, so the native
        // picker opens on every platform. NOT pointer-events-none — see above.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
