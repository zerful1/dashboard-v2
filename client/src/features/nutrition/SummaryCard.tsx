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
          <span className="tnum text-2xl font-extrabold">{kcal.toLocaleString()}</span>
          <span className="text-muted">
            {target ? ` / ${target.calories.toLocaleString()} kcal` : " kcal eaten"}
          </span>
        </p>
        {target && left !== null ? (
          <p className={cn("tnum text-sm font-semibold", left < 0 ? "text-gold" : "text-muted")}>
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
  const pct = bar.target > 0 ? Math.min(100, (bar.eaten / bar.target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{bar.label}</span>
        <span className="tnum">
          {bar.eaten} / {bar.target} g
        </span>
      </div>
      {/* The track is chrome, so `raised` is allowed; the fill is data, so it
          is neutral, and gold only when over. Never the accent. */}
      <div
        role="progressbar"
        aria-label={bar.label}
        aria-valuenow={bar.eaten}
        aria-valuemin={0}
        aria-valuemax={bar.target}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"
      >
        <div className={cn("h-full rounded-full", bar.over ? "bg-gold" : "bg-muted")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
