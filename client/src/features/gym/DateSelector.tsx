import { useRef } from "react";
import { Calendar } from "lucide-react";
import { toLocalISO } from "@dashboard/shared";

function label(value: string, today: string): string {
  if (value === today) return "Today";
  // Split and rebuild as a LOCAL date. new Date('2026-08-16') parses as UTC and
  // would render the previous day for anyone behind it — the same class of
  // shift the whole date-as-string discipline exists to avoid.
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DateSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (d: string) => void;
}) {
  const today = toLocalISO();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() => {
        try {
          inputRef.current?.showPicker?.();
        } catch {
          /* showPicker is unsupported or blocked — the native input still works */
        }
      }}
      className="relative inline-flex items-center gap-2 rounded-full border border-raised bg-surface px-3 py-1.5 text-xs text-muted"
    >
      <Calendar size={13} className="text-accent" />
      <span>{label(value, today)}</span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={today}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </button>
  );
}
