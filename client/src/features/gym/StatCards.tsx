import { setLong } from "@dashboard/shared";
import type { ExerciseStats } from "@dashboard/shared";

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-raised bg-surface p-3">
      <div className="lbl">{label}</div>
      <div className="tnum mt-1 text-lg font-extrabold tracking-tight">{value}</div>
      {sub && <div className="lbl mt-1 text-dim">{sub}</div>}
    </div>
  );
}

export function StatCards({ stats }: { stats: ExerciseStats }) {
  // Good for gains, caution for losses. Never the accent — that belongs to the one
  // action on the screen, and a stat is not an action.
  const deltaTone =
    stats.delta30 === null
      ? "text-dim"
      : stats.delta30.value > 0
        ? "text-good"
        : stats.delta30.value < 0
          ? "text-caution"
          : "text-muted";

  return (
    <div className="grid grid-cols-2 gap-2">
      <Cell label="Heaviest set" value={stats.heaviestSet ? setLong(stats.heaviestSet) : "—"} />
      <Cell
        label={stats.isBodyweightOnly ? "Best set" : "Best est. 1RM"}
        // 1RM is meaningless for bodyweight work, so show top reps instead of a
        // number derived from a weight of zero.
        value={
          stats.isBodyweightOnly
            ? stats.heaviestSet
              ? `${stats.heaviestSet.reps} reps`
              : "—"
            : stats.bestOneRM !== null
              ? `${stats.bestOneRM.toFixed(1)} kg`
              : "—"
        }
      />
      <div className="rounded-card border border-raised bg-surface p-3">
        <div className="lbl">30-day change</div>
        <div className={`tnum mt-1 text-lg font-extrabold tracking-tight ${deltaTone}`}>
          {stats.delta30 === null
            ? "—"
            : `${stats.delta30.value > 0 ? "+" : ""}${stats.delta30.value.toFixed(1)} ${stats.delta30.unit}`}
        </div>
      </div>
      <Cell
        label="Times trained"
        value={String(stats.sessionCount)}
        // Anchored to the last SESSION date, not today — "3 weeks ago" is the
        // useful fact, and it does not drift while you are not training.
        sub={stats.lastTrainedDate ? `LAST ${stats.lastTrainedDate}` : undefined}
      />
    </div>
  );
}
