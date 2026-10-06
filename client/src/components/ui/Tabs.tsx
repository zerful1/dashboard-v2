import { cn } from "@/lib/cn";

interface Props<T extends string> {
  tabs: readonly { id: T; label: string }[];
  /** Null while the choice is still being made (the add sheet waits for Recent). */
  value: T | null;
  onChange: (id: T) => void;
  className?: string;
}

/**
 * Underline tabs (redesign spec §5.6): grey labels, the selected one white
 * with a white rule beneath, a hairline under the row. Choices that are not
 * views — Cut / Maintain / Bulk — are Buttons with `selected` and `subtle`.
 */
export function Tabs<T extends string>({ tabs, value, onChange, className }: Props<T>) {
  return (
    <div role="tablist" className={cn("flex gap-5 border-b border-raised", className)}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px border-b-[1.5px] pb-2.5 text-sm font-medium transition",
              on ? "border-accent text-accent" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
