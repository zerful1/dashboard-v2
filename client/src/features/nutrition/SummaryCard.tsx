import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { DaySummary, MacroBar } from "./deriveDay";

export function SummaryCard({ summary, onSetTargets }: { summary: DaySummary; onSetTargets: () => void }) {
  const { kcal, target, left, bars } = summary;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className="figure text-4xl">{kcal.toLocaleString()}</span>
          <span className="text-muted">
            {target ? ` / ${target.calories.toLocaleString()} kcal` : " kcal eaten"}
          </span>
        </p>
        {target && left !== null ? (
          <p className={cn("tnum text-sm font-semibold", left < 0 ? "text-caution" : "text-muted")}>
            {left < 0 ? `${Math.abs(left).toLocaleString()} over` : `${left.toLocaleString()} left`}
          </p>
        ) : (
          <Button variant="ghost" onClick={onSetTargets}>
            Set targets
          </Button>
        )}
      </div>
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
