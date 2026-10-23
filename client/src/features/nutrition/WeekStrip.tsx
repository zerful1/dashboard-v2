import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { stripDates, type StripDay, type WeekStrip as Strip } from "@dashboard/shared";
import { rangeLabel, spokenDate, weekdayInitial } from "@/lib/dates";
import { cn } from "@/lib/cn";

/** "2.3k" from 1,000 up, whole numbers below: the number under a bar. */
export function shortKcal(kcal: number): string {
  return kcal >= 1000 ? `${(kcal / 1000).toFixed(1)}k` : String(kcal);
}

/** The day button's name: the date, then only what is known about it. */
function spoken(date: string, d: StripDay | undefined, known: boolean): string {
  const when = spokenDate(date);
  if (!d || !known) return when;
  if (d.kcal === null) return `${when}: nothing logged`;
  const parts = [`${d.kcal.toLocaleString("en-GB")} kcal`];
  if (d.over && d.target) parts.push(`${(d.kcal - d.target.calories).toLocaleString("en-GB")} over target`);
  if (d.protein !== null) parts.push(d.target ? `protein ${d.protein} of ${d.target.protein_g} g` : `protein ${d.protein} g`);
  return `${when}: ${parts.join(", ")}`;
}

interface Props {
  /** The strip's last day. */
  end: string;
  today: string;
  /** The day open below. */
  open: string;
  /** Null until the days and targets have loaded: the strip claims nothing. */
  strip: Strip | null;
  failed: boolean;
  /** Today's column comes from yesterday's answer (offline on a new day): unknown, not empty. */
  todayUnknown: boolean;
  onOpen: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Food's 7-day strip: each day's kcal against its own target, and the day
 * picker. Plain elements: WeightChart.tsx stays the only chart import.
 */
export function WeekStrip({ end, today, open, strip, failed, todayUnknown, onOpen, onPrev, onNext }: Props) {
  const labelId = useId();
  const dates = stripDates(end);
  const label = end === today ? "Last 7 days" : rangeLabel(dates[0]!, end, today);
  // One scale for the week: the biggest of every day's kcal and target.
  const scale = strip ? Math.max(0, ...strip.days.map((d) => Math.max(d.kcal ?? 0, d.target?.calories ?? 0))) : 0;
  const pct = (n: number) => `${(n / scale) * 100}%`;

  return (
    <section className="space-y-1.5">
      {failed ? (
        <p className="py-6 text-center text-sm text-muted">Couldn't load the week.</p>
      ) : (
        <div role="group" aria-labelledby={labelId} className="grid grid-cols-7 gap-1">
          {dates.map((date, i) => {
            const d = strip?.days[i];
            const known = !!d && !(d.inProgress && todayUnknown);
            const logged = known && d!.kcal !== null;
            const selected = date === open;
            return (
              <button
                key={date}
                type="button"
                aria-pressed={selected}
                aria-label={spoken(date, d, known)}
                onClick={() => onOpen(date)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl pt-1.5 pb-2",
                  // A tint: the open day is the selected item in a set.
                  selected ? "bg-accent/10" : "hover:bg-accent/5",
                )}
              >
                <span aria-hidden="true" className={cn("text-[10px]", selected ? "text-text" : "text-muted")}>
                  {weekdayInitial(date)}
                </span>
                <span aria-hidden="true" className="relative h-14 w-3.5">
                  {logged && scale > 0 && (
                    <>
                      {/* Data ink: white up to the target, amber stripes past it. */}
                      <span
                        data-part="fill"
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-accent"
                        style={{ height: pct(d!.over ? d!.target!.calories : d!.kcal!) }}
                      />
                      {d!.over && (
                        <span
                          data-part="over"
                          className="bar-over absolute inset-x-0 rounded-t-sm"
                          style={{ bottom: pct(d!.target!.calories), height: pct(d!.kcal! - d!.target!.calories) }}
                        />
                      )}
                    </>
                  )}
                  {known && d!.target && scale > 0 && (
                    <span
                      data-part="target"
                      className="absolute -inset-x-1 border-t border-dashed border-dim"
                      style={{ bottom: pct(d!.target.calories) }}
                    />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("tnum h-3.5 text-[10px] leading-3.5", known && d!.over ? "text-caution" : "text-muted")}
                >
                  {known && (d!.kcal === null ? <span className="text-dim">—</span> : shortKcal(d!.kcal))}
                </span>
                <span aria-hidden="true" className="flex h-1.5 items-center">
                  {logged && d!.target && (
                    // A done mark: a small white circle, never a button.
                    <span
                      data-part="protein"
                      className={cn("h-1.5 w-1.5 rounded-full", d!.proteinHit ? "bg-accent" : "border border-dim")}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="tnum text-xs text-muted">
          <span id={labelId}>{label}</span>
          {strip && !failed && strip.over !== null && <> · {strip.over === 0 ? "none over" : `${strip.over} over`}</>}
          {strip && !failed && strip.avg !== null && <> · avg {strip.avg.toLocaleString("en-GB")}</>}
        </p>
        <div className="flex shrink-0 items-center">
          <button type="button" aria-label="Previous week" onClick={onPrev} className="rounded-full p-1.5 text-muted hover:text-text">
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={onNext}
            disabled={end >= today}
            className="rounded-full p-1.5 text-muted hover:text-text disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
