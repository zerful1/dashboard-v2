import { weekdayInitial, type HabitSummary } from "@dashboard/shared";
import { cn } from "@/lib/cn";

/** A habit with its streak and the 7-day strip; each day toggles. */
export function HabitRow({ habit, days, today, locked, onToggle }: {
  habit: HabitSummary;
  days: string[];
  today: string;
  /** Not saved yet: no server id to mark days against. */
  locked: boolean;
  onToggle: (date: string, done: boolean) => void;
}) {
  return (
    <li className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          {habit.emoji && <span className="mr-1.5">{habit.emoji}</span>}
          {habit.name}
        </span>
        {habit.streak > 0 && <span className="text-xs text-muted">{habit.streak}-day streak</span>}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const done = habit.recent.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-label={`${habit.name} on ${d}`}
              aria-pressed={done}
              disabled={locked}
              onClick={() => onToggle(d, !done)}
              className="flex h-9 items-center justify-center disabled:opacity-40"
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium",
                  done ? "bg-accent text-bg" : "border-[1.5px] border-edge text-muted",
                  // Today, ringed whether ticked or not, so the strip has a "now".
                  d === today && "ring-1 ring-muted ring-offset-2 ring-offset-bg",
                )}
              >
                {weekdayInitial(d)}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}
