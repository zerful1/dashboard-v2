import { Check } from "lucide-react";
import type { SplitDay } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";

/** The split's days, behind Gym's title. The current one is tinted: a selection, not an action. */
export function DayPickerSheet({
  open,
  days,
  selected,
  onPick,
  onClose,
}: {
  open: boolean;
  days: SplitDay[];
  selected: number;
  onPick: (dayType: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Training day">
      <div className="space-y-1">
        {days.map(({ day_type, label }) => {
          const active = day_type === selected;
          return (
            <button
              key={day_type}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onPick(day_type);
                onClose();
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm",
                active ? "bg-accent/10 font-semibold text-accent" : "text-text hover:bg-accent/5",
              )}
            >
              {label}
              {active && <Check size={14} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
