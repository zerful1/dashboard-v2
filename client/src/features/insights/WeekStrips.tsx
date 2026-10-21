import type { ReviewDay } from "@dashboard/shared";
import { weekdayInitial } from "@/lib/dates";

/**
 * The Monday-to-Sunday strips beside the week's rows.
 * Plain elements and SVG on one 70 px grid of seven 10 px columns, so the
 * weekday row under them lines up. Decorative: each row says it in words.
 */
const CELL = 10;

/** A day's bar as percentages of the strip: white to the target, striped past it. Null: nothing logged. */
export function foodBar(kcal: number | null, target: number | null, scale: number): { fill: number; over: number } | null {
  if (kcal === null || scale <= 0) return null;
  const pct = (n: number) => (n / scale) * 100;
  if (target !== null && kcal > target) return { fill: pct(target), over: pct(kcal - target) };
  return { fill: pct(kcal), over: 0 };
}

/** Each weigh-in as a point in a 70×28 box; the scale never tighter than 1 kg, centred on the week. */
export function weightPoints(days: ReviewDay[]): { x: number; y: number }[] {
  const kgs = days.map((d) => d.weightKg).filter((k): k is number => k !== null);
  if (kgs.length === 0) return [];
  const mid = (Math.min(...kgs) + Math.max(...kgs)) / 2;
  const half = Math.max((Math.max(...kgs) - Math.min(...kgs)) / 2, 0.5);
  return days.flatMap((d, i) =>
    d.weightKg === null ? [] : [{ x: i * CELL + CELL / 2, y: Math.round((3 + ((mid + half - d.weightKg) / (2 * half)) * 22) * 10) / 10 }],
  );
}

export function TrainingDots({ days }: { days: ReviewDay[] }) {
  return (
    <span aria-hidden className="grid w-[70px] grid-cols-7 justify-items-center">
      {days.map((d) => (
        <span
          key={d.date}
          data-part="mark"
          className={d.trained ? "h-[7px] w-[7px] rounded-full bg-accent" : "h-[7px] w-[7px] rounded-full border border-dim"}
        />
      ))}
    </span>
  );
}

export function FoodBars({ days, target }: { days: ReviewDay[]; target: number | null }) {
  const scale = Math.max(target ?? 0, ...days.map((d) => d.kcal ?? 0));
  return (
    <span aria-hidden className="relative grid h-[30px] w-[70px] grid-cols-7 justify-items-center">
      {/* No target line over an empty week: it marked a level nothing reached. */}
      {target !== null && scale > 0 && days.some((d) => d.kcal !== null) && (
        <span className="absolute inset-x-0 border-t border-dashed border-dim" style={{ bottom: `${(target / scale) * 100}%` }} />
      )}
      {days.map((d) => {
        const bar = foodBar(d.kcal, target, scale);
        return (
          <span key={d.date} className="relative h-full w-[6px]">
            {bar && (
              <>
                <span className="absolute inset-x-0 bottom-0 rounded-t-[1px] bg-accent" style={{ height: `${bar.fill}%` }} />
                {bar.over > 0 && (
                  <span className="bar-over absolute inset-x-0" style={{ bottom: `${bar.fill}%`, height: `${bar.over}%` }} />
                )}
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function WeightDots({ days }: { days: ReviewDay[] }) {
  const pts = weightPoints(days);
  const last = pts[pts.length - 1];
  return (
    <svg aria-hidden width="70" height="28" viewBox="0 0 70 28">
      {pts.length > 1 && (
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-text)" strokeWidth="1.5" />
      )}
      {pts.map((p) => (
        <circle key={p.x} cx={p.x} cy={p.y} r={p === last ? 2.5 : 2} fill={p === last ? "var(--color-text)" : "var(--color-dim)"} />
      ))}
    </svg>
  );
}

export function WeekdayRow({ days }: { days: ReviewDay[] }) {
  return (
    <span aria-hidden className="grid w-[70px] grid-cols-7 justify-items-center text-[10px] text-muted">
      {days.map((d) => (
        <span key={d.date}>{weekdayInitial(d.date)}</span>
      ))}
    </span>
  );
}
