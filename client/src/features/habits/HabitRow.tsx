import { weekdayInitial, type HabitSummary } from "@dashboard/shared";
import { cn } from "@/lib/cn";

/** A habit with its streak and the 7-day strip; each day toggles. */
export function HabitRow({ habit, days, today, onToggle }: {
  habit: HabitSummary;
  days: string[];
  today: string;
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
              onClick={() => onToggle(d, !done)}
              className={cn(
                "h-9 rounded-lg border font-mono text-[10px]",
                done ? "border-transparent bg-accent/10 text-accent" : "border-raised text-muted",
                d === today && "ring-1 ring-raised",
              )}
            >
              {weekdayInitial(d)}
            </button>
          );
        })}
      </div>
    </li>
  );
}
