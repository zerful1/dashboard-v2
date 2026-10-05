import type { HomeWeek } from "@dashboard/shared";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function WeekTile({ week }: { week: HomeWeek }) {
  return (
    <div className="border-t border-raised py-4">
      <div className="lbl">This week</div>
      <div className="figure mt-1 text-3xl">
        {week.logged}
        <span className="text-sm font-semibold text-muted"> / {week.target}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {week.days.map((done, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              className={
                done ? "h-2 w-2 rounded-full bg-accent" : "h-2 w-2 rounded-full border border-dim"
              }
            />
            <span className="text-[10px] leading-none text-dim">{LETTERS[i]}</span>
          </div>
        ))}
      </div>
      {/* The dots are colour-only, so the count above is what actually conveys
          this. Give assistive tech the same sentence. */}
      <span className="sr-only">
        {week.logged} of {week.target} sessions logged this week
      </span>
    </div>
  );
}
