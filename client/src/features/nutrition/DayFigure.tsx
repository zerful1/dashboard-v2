import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { DaySummary, MacroBar } from "./deriveDay";

/**
 * The open day (redesign part 4, §4): what's left, or eaten with no target, in
 * Home's figure, over the macro bars.
 */
export function DayFigure({ summary, onSetTargets }: { summary: DaySummary; onSetTargets: () => void }) {
  const { kcal, target, left, bars } = summary;
  const over = left !== null && left < 0;
  const figure = target === null || left === null ? kcal : Math.abs(left);
  const unit = target === null ? "kcal eaten" : over ? "kcal over" : "kcal left";
  return (
    <Card>
      {/* Amber only past the target: the signal colour's one job. */}
      <div className={cn("figure text-5xl", over && "text-caution")}>
        {figure.toLocaleString("en-GB")}{" "}
        <span className="text-sm font-normal tracking-normal text-muted">{unit}</span>
      </div>
      {target ? (
        <p className="tnum mt-1.5 text-xs text-muted">
          {kcal.toLocaleString("en-GB")} of {target.calories.toLocaleString("en-GB")} eaten
        </p>
      ) : (
        <button
          type="button"
          onClick={onSetTargets}
          className="mt-2 text-sm text-muted underline underline-offset-4 hover:text-text"
        >
          Set targets
        </button>
      )}
      {bars.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {bars.map((b) => (
            <MacroMeter key={b.key} bar={b} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MacroMeter({ bar }: { bar: MacroBar }) {
  const ratio = bar.target > 0 ? bar.eaten / bar.target : 0;
  // Over target the bar is full: white up to the target's notch, amber stripes
  // past it (redesign spec §5.7). Otherwise the fill is the share eaten.
  const targetPct = bar.over && ratio > 0 ? 100 / ratio : 100;
  const fillPct = bar.over ? targetPct : Math.min(100, ratio * 100);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{bar.label}</span>
        <span className={cn("tnum", bar.over && "text-caution")}>
          {bar.eaten} / {bar.target} g
        </span>
      </div>
      {/* The track is chrome, so `raised` is allowed; the fill is data, white,
          and only the excess is amber. */}
      <div
        role="progressbar"
        aria-label={bar.label}
        aria-valuenow={bar.eaten}
        aria-valuemin={0}
        aria-valuemax={bar.target}
        className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-raised"
      >
        <div data-part="fill" className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${fillPct}%` }} />
        {bar.over && (
          <>
            <div data-part="over" className="bar-over absolute inset-y-0 right-0" style={{ left: `${targetPct}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-bg" style={{ left: `calc(${targetPct}% - 1px)` }} />
          </>
        )}
      </div>
    </div>
  );
}
