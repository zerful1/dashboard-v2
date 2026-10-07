import type { GridDay, SessionSummary, TrainingGrid as Grid } from "@dashboard/shared";
import { listDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * Twelve weeks at a glance (redesign part 3b, §5): weeks are columns, Monday on
 * top. A trained day is a small white square, a done mark under 24 px, and the
 * only kind a screen reader is told about. Capped at max-w-xs, so it stays a
 * mark on a desktop.
 */
export function TrainingGrid({ grid, today, onOpen }: {
  grid: Grid<SessionSummary>;
  today: string;
  onOpen: (day: GridDay<SessionSummary>) => void;
}) {
  return (
    <div role="group" aria-label="Training, last 12 weeks" className="mt-3 grid max-w-xs grid-flow-col grid-rows-7 auto-cols-fr gap-1.5">
      {grid.weeks.flat().map((day) =>
        day.sessions.length > 0 ? (
          <button
            key={day.date}
            type="button"
            onClick={() => onOpen(day)}
            aria-label={`${listDate(day.date, today)}, ${day.sessions.map((s) => s.day_name).join(" and ")}`}
            className="aspect-square rounded-[3px] bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
        ) : (
          <span key={day.date} aria-hidden="true" className={cn("aspect-square rounded-[3px]", !day.future && "border border-edge")} />
        ),
      )}
    </div>
  );
}
