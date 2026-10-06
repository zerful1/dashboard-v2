import { Check } from "lucide-react";
import { isUnsaved, useHabits } from "@/hooks/useHabits";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/** Today's habits on Home: one tap each, on the screen opened every day. */
export function TodayHabitsCard() {
  const { habits, today, isPending, isError, hasData, refetch, setDone } = useHabits();

  // Nothing until the answer is in (CLAUDE.md: isPending, not isLoading).
  if (isPending) return null;
  if (isError && !hasData) {
    return (
      <Card>
        <div className="lbl">Today&apos;s habits</div>
        <p className="mt-2 text-sm text-muted">
          Couldn&apos;t load your habits.{" "}
          <button type="button" onClick={() => void refetch()} className="text-text underline underline-offset-4">
            Retry
          </button>
        </p>
      </Card>
    );
  }
  // Someone who doesn't keep habits never sees the card.
  if (habits.length === 0) return null;

  return (
    <Card className="space-y-3">
      <div className="lbl">Today&apos;s habits</div>
      <ul className="space-y-2">
        {habits.map((h) => {
          const done = h.recent.includes(today);
          return (
            <li key={h.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                {h.emoji && <span className="mr-1.5">{h.emoji}</span>}
                {h.name}
              </span>
              {h.streak > 0 && <span className="text-xs text-muted">{h.streak}-day streak</span>}
              <button
                type="button"
                aria-label={done ? `Mark ${h.name} not done` : `Mark ${h.name} done`}
                aria-pressed={done}
                disabled={isUnsaved(h)}
                onClick={() => setDone.mutate({ id: h.id, date: today, done: !done })}
                className="flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-40"
              >
                {/* A white circle when ticked: a done mark (the accent rule's
                    circle), inside a full-size tap target. */}
                <span
                  data-part="mark"
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    done ? "bg-accent text-bg" : "border-[1.5px] border-dim text-muted",
                  )}
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
