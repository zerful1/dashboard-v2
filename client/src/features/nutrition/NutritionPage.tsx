import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { shiftISO } from "@dashboard/shared";
import type { FoodLogEntry } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateSelector } from "@/components/ui/DateSelector";
import { Spinner } from "@/components/ui/Spinner";
import { useDiary } from "@/hooks/useDiary";
import { useTargets } from "@/hooks/useTargets";
import { useToday } from "@/hooks/useToday";
import { deriveDay } from "./deriveDay";
import { SummaryCard } from "./SummaryCard";
import { DiaryList } from "./DiaryList";
import { LabelStrip } from "./LabelStrip";
import { AddFoodSheet } from "./AddFoodSheet";
import { EditEntrySheet } from "./EditEntrySheet";
import { CopyDaySheet } from "./CopyDaySheet";
import { TargetsSheet } from "./TargetsSheet";

export function NutritionPage() {
  const today = useToday();
  // Only a day the user picked is state. Until then the page follows the clock,
  // so an app left open overnight wakes on the new day, not yesterday.
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const setDate = (d: string) => setPicked(d === today ? null : d);
  // The page renders its own failure below, so these two do not also toast.
  const diary = useDiary(date, { errorToast: false });
  const targets = useTargets({ errorToast: false });
  const failed = (diary.isError && !diary.hasData) || (targets.isError && !targets.hasData);
  const stale = !failed && (diary.isError || targets.isError);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [copying, setCopying] = useState(false);
  const [targeting, setTargeting] = useState(false);

  const summary = useMemo(
    () => deriveDay(diary.entries, targets.targets, date),
    [diary.entries, targets.targets, date],
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Food</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Nutrition</h1>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous day"
            onClick={() => setDate(shiftISO(date, -1))}
            className="rounded-full p-1.5 text-muted hover:text-text"
          >
            <ChevronLeft size={16} />
          </button>
          <DateSelector value={date} onChange={setDate} />
          <button
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(shiftISO(date, 1))}
            className="rounded-full p-1.5 text-muted hover:text-text disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <Button variant="ghost" onClick={() => setTargeting(true)}>
          Targets
        </Button>
      </div>

      {failed ? (
        // Distinct from an empty day: a failed fetch must not read as "nothing eaten".
        // Only when there is nothing to show: a failed refresh keeps the last good data.
        <Card>
          <div className="lbl text-negative">Could not load</div>
          <p className="mt-2 text-sm text-muted">Your diary could not be fetched. Check your connection and retry.</p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => {
              if (diary.isError) void diary.refetch();
              if (targets.isError) void targets.refetch();
            }}
          >
            Retry
          </Button>
        </Card>
      ) : diary.isPending || targets.isPending ? (
        // BOTH, not either: "2,402 left" from an unloaded diary would be a
        // real-looking, wrong number (CLAUDE.md, TanStack section).
        <Spinner label="Loading your day" />
      ) : (
        <>
          {stale && <p className="text-xs text-dim">Couldn't refresh — showing saved data.</p>}
          <SummaryCard summary={summary} onSetTargets={() => setTargeting(true)} />
          <div className="flex gap-2">
            {/* The one filled action on this screen. */}
            <Button className="flex-1" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add food
            </Button>
            <Button variant="ghost" onClick={() => setCopying(true)}>
              <Copy size={16} /> Copy day
            </Button>
          </div>
          <DiaryList entries={diary.entries} onSelect={setEditing} />
          <LabelStrip labels={summary.labels} />
        </>
      )}

      <AddFoodSheet open={adding} onClose={() => setAdding(false)} date={date} addEntry={diary.addEntry} />
      <EditEntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        rescale={diary.rescaleEntry}
        remove={diary.removeEntry}
      />
      <CopyDaySheet open={copying} onClose={() => setCopying(false)} to={date} copy={diary.copyDay} />
      <TargetsSheet
        open={targeting}
        onClose={() => setTargeting(false)}
        today={today}
        targets={targets.targets}
        addTarget={targets.addTarget}
      />
    </div>
  );
}
