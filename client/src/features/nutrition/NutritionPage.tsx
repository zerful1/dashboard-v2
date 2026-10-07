import { useMemo, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { shiftISO, weekStrip } from "@dashboard/shared";
import type { FoodLogEntry } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useDiary } from "@/hooks/useDiary";
import { useFoodDays } from "@/hooks/useFoodDays";
import { useTargets } from "@/hooks/useTargets";
import { useToday } from "@/hooks/useToday";
import { deriveDay } from "./deriveDay";
import { FoodHeader } from "./FoodHeader";
import { WeekStrip } from "./WeekStrip";
import { DayFigure } from "./DayFigure";
import { DiaryList } from "./DiaryList";
import { LabelStrip } from "./LabelStrip";
import { AddFoodSheet } from "./AddFoodSheet";
import { EditEntrySheet } from "./EditEntrySheet";
import { CopyDaySheet } from "./CopyDaySheet";
import { TargetsSheet } from "./TargetsSheet";

/** The strip's last day and the open day, once the user has picked either. */
interface Picked {
  end: string;
  open: string;
}

export function NutritionPage() {
  const today = useToday();
  // Only what the user picked is state. Until then the strip ends today and
  // today is open, both following the clock, so an app left open overnight
  // wakes on the new day, not yesterday.
  const [picked, setPicked] = useState<Picked | null>(null);
  const end = picked?.end ?? today;
  const open = picked?.open ?? today;
  const from = shiftISO(end, -6);
  // Today open, with the strip ending today, IS following the clock (spec §3).
  const choose = (next: Picked) => setPicked(next.end === today && next.open === today ? null : next);
  const pickDate = (d: string) => {
    // The picker is capped at today, but a typed date is not.
    if (d > today) return;
    choose({ end: d >= from && d <= end ? end : d, open: d });
  };
  const moveWeek = (days: number) => {
    const moved = shiftISO(end, days);
    const next = moved > today ? today : moved;
    choose({ end: next, open: next });
  };

  // The page renders its own failure below, so these do not also toast.
  const diary = useDiary(open, { errorToast: false });
  const targets = useTargets({ errorToast: false });
  const week = useFoodDays(from, end, today);
  const failed = (diary.isError && !diary.hasData) || (targets.isError && !targets.hasData);
  const stale = !failed && (diary.isError || targets.isError);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [copying, setCopying] = useState(false);
  const [targeting, setTargeting] = useState(false);

  const summary = useMemo(() => deriveDay(diary.entries, targets.targets, open), [diary.entries, targets.targets, open]);
  // A conclusion, so it waits for the targets as well as the days (CLAUDE.md, isPending).
  const strip = useMemo(
    () => (week.days && targets.hasData ? weekStrip(week.days, targets.targets, end, today) : null),
    [week.days, targets.hasData, targets.targets, end, today],
  );

  return (
    <div className="space-y-4">
      <FoodHeader date={open} onDate={pickDate} onTargets={() => setTargeting(true)} />

      <WeekStrip
        end={end}
        today={today}
        open={open}
        strip={strip}
        failed={week.failed || (targets.isError && !targets.hasData)}
        todayUnknown={week.isPlaceholder}
        onOpen={(d) => choose({ end, open: d })}
        onPrev={() => moveWeek(-7)}
        onNext={() => moveWeek(7)}
      />

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
          {stale && <p className="text-xs text-muted">Couldn't refresh — showing saved data.</p>}
          <DayFigure summary={summary} onSetTargets={() => setTargeting(true)} />
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

      <AddFoodSheet open={adding} onClose={() => setAdding(false)} date={open} addEntry={diary.addEntry} />
      <EditEntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        rescale={diary.rescaleEntry}
        remove={diary.removeEntry}
      />
      <CopyDaySheet open={copying} onClose={() => setCopying(false)} to={open} copy={diary.copyDay} />
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
