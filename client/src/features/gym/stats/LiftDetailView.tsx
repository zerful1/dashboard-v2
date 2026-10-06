import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { setCell } from "@dashboard/shared";
import { List } from "@/components/ui/List";
import { Spinner } from "@/components/ui/Spinner";
import { LiftChart } from "@/features/weight/WeightChart";
import { useLiftDetail } from "@/hooks/useLiftStats";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { liftBadge, TONE } from "./liftBadge";

const RECENT = 5;

/** One lift (redesign part 3b, §4): its best, its trend, and its recent sessions set by set. */
export function LiftDetailView({ name, today, onBack }: { name: string; today: string; onBack: () => void }) {
  const { detail, isPending, isError } = useLiftDetail(name, today);
  const [all, setAll] = useState(false);
  const badge = detail ? liftBadge(detail.progress) : null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="lbl inline-flex items-center gap-1 text-muted hover:text-text">
        <ChevronLeft size={12} aria-hidden="true" />
        All lifts
      </button>
      <h2 className="text-[17px] font-semibold tracking-tight">{name}</h2>

      {isPending ? (
        <Spinner label="Loading the lift" />
      ) : !detail ? (
        <p className="text-sm text-muted">{isError ? "Couldn't load this lift." : "No sets for this lift yet."}</p>
      ) : (
        <>
          <section aria-label="Best" className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="lbl">Best</div>
              {detail.progress.best ? (
                <div className="figure mt-1 text-4xl">
                  {setCell(detail.progress.best)}
                  <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">
                    {shortDate(detail.progress.best.date, today)}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-sm text-muted">None in the last 32 weeks</div>
              )}
            </div>
            {badge ? (
              <span className={cn("tnum shrink-0 text-xs", TONE[badge.tone])}>{badge.text}</span>
            ) : (
              <span className="tnum shrink-0 text-xs text-muted">Last {shortDate(detail.progress.lastDate, today)}</span>
            )}
          </section>
          {detail.allTime && (
            <p className="tnum text-xs text-muted">
              All-time: {setCell(detail.allTime)} · {shortDate(detail.allTime.date, today)}
            </p>
          )}

          <LiftChart points={detail.points} unit={detail.bodyweightOnly ? "reps" : "kg"} />

          <section aria-label="Recent sessions">
            <div className="lbl pb-2">Recent sessions · {detail.sessions.length} in all</div>
            <List>
              {(all ? detail.sessions : detail.sessions.slice(0, RECENT)).map((s) => (
                <div key={s.session_id} className="flex gap-3 py-2 text-[13px]">
                  <span className="tnum w-16 shrink-0 text-muted">{shortDate(s.date, today)}</span>
                  <span className="tnum min-w-0">{s.sets.map(setCell).join(" · ")}</span>
                </div>
              ))}
            </List>
            {!all && detail.sessions.length > RECENT && (
              <button type="button" onClick={() => setAll(true)} className="w-full py-3 text-center text-xs text-muted hover:text-text">
                Show all
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
