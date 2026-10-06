import type { HomeWeek } from "@dashboard/shared";
import { Card } from "@/components/ui/Card";

/** The week in one line: the count carries it, the dots repeat it for the eye. */
export function WeekLine({ week }: { week: HomeWeek }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="lbl">
          This week · {week.logged} of {week.target} sessions
        </span>
        <span aria-hidden className="flex gap-1.5">
          {week.days.map((done, i) => (
            <span
              key={i}
              data-part="mark"
              className={done ? "h-2 w-2 rounded-full bg-accent" : "h-2 w-2 rounded-full border border-dim"}
            />
          ))}
        </span>
      </div>
    </Card>
  );
}
