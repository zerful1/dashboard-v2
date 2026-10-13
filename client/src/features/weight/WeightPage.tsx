import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { periodRows } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useWeights } from "@/hooks/useWeights";
import { goalsQueryOptions } from "@/hooks/useGoals";
import { useToday } from "@/hooks/useToday";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { deriveWeightSummary, RANGES, rangeStart, type RangeId } from "./deriveWeight";
import { WeightHeadline } from "./WeightHeadline";
import { WeightChart } from "./WeightChart";
import { PeriodList } from "./PeriodList";
import { WeighInSheet, type WeighInTarget } from "./WeighInSheet";

/** 1M to All: a set, so the chosen one is tinted and the rest subtle (as Cut / Maintain / Bulk). */
function RangePicker({ value, onChange }: { value: RangeId; onChange: (id: RangeId) => void }) {
  return (
    <div role="group" aria-label="Range" className="flex gap-1">
      {RANGES.map((r) => (
        <Button
          key={r.id}
          variant={r.id === value ? "selected" : "subtle"}
          aria-pressed={r.id === value}
          className="flex-1 px-0 py-1.5 text-xs"
          onClick={() => onChange(r.id)}
        >
          {r.id}
        </Button>
      ))}
    </div>
  );
}

export function WeightPage() {
  // One clock for the page: its today goes to every child (CLAUDE.md).
  const today = useToday();
  const { user } = useAuth();
  const { entries, isPending, isError, hasData, saveWeight, deleteWeight } = useWeights();
  const goals = useQuery(goalsQueryOptions(user?.id));
  const [range, setRange] = useState<RangeId>("3M");
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<WeighInTarget | null>(null);

  const summary = useMemo(() => deriveWeightSummary(entries, today), [entries, today]);
  const spec = RANGES.find((r) => r.id === range)!;
  const start = rangeStart(spec, today, summary.points[0]?.date ?? today);
  const rows = useMemo(() => periodRows(summary.points, spec.period, start, today), [summary.points, spec.period, start, today]);

  // isPending, not isLoading (CLAUDE.md), and the goals too: the goal colours
  // the rate and writes the goal line, so drawing first would flip white to
  // green. Not while the goals are paused offline with nothing saved, though:
  // that would spin forever, so it reads as a failed load instead. And only
  // until the page has drawn once: the signal returning starts the goals'
  // fetch (pending again), and spinning then would unmount an open sheet.
  const [drawn, setDrawn] = useState(false);
  const ready = !isPending && !(goals.isPending && goals.fetchStatus !== "paused" && !drawn);
  useEffect(() => {
    if (ready) setDrawn(true);
  }, [ready]);
  if (!ready) {
    return <Spinner label="Loading your weight history" />;
  }

  // Distinguished from empty: a failed fetch must not read as "no data yet".
  // Only when there is nothing to show, though: a failed refresh keeps the
  // last good history, and the toast says it failed.
  if (isError && !hasData) {
    return (
      <Card>
        <div className="lbl text-negative">Could not load</div>
        <p className="mt-2 text-sm text-muted">
          Your weight history could not be fetched. Check your connection and retry.
        </p>
      </Card>
    );
  }

  const goal = goals.data?.find((g) => g.kind === "weight") ?? null;
  const goalsFailed = !goals.data && (goals.isError || goals.fetchStatus === "paused");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Weight</h1>
        {/* The one white action on this screen. */}
        <Button onClick={() => setTarget({ mode: "log" })}>Log</Button>
      </div>

      <WeightHeadline summary={summary} today={today} goal={goal} goalsFailed={goalsFailed} />

      {summary.points.length > 0 && (
        <>
          <RangePicker
            value={range}
            onChange={(id) => {
              setRange(id);
              setOpen(null);
            }}
          />
          <WeightChart
            points={summary.points}
            line={summary.line}
            start={start}
            today={today}
            goalKg={goal?.target_kg ?? null}
            span={spec.span}
            weekly={spec.id === "1M"}
          />
          <PeriodList
            rows={rows}
            kind={spec.period}
            entries={entries}
            goalKg={goal?.target_kg ?? null}
            today={today}
            open={open}
            onToggle={(s) => setOpen((o) => (o === s ? null : s))}
            onSelect={(e) => setTarget({ mode: "edit", entry: e })}
          />
        </>
      )}

      <WeighInSheet
        target={target}
        onClose={() => setTarget(null)}
        entries={entries}
        today={today}
        save={saveWeight}
        remove={deleteWeight}
      />
    </div>
  );
}
