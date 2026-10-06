import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDayName, toLocalISO } from "@dashboard/shared";
import type { Exercise } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { useSplit } from "@/hooks/useSplit";
import { useGymDay } from "@/hooks/useGymDay";
import { useExercises } from "@/hooks/useExercises";
import { useWorkoutDay } from "@/hooks/useWorkoutDay";
import { useLastTimes } from "@/hooks/useLastTimes";
import { useHistoryExerciseNames } from "@/hooks/useExerciseStats";
import { GymHeader } from "./GymHeader";
import { DayPickerSheet } from "./DayPickerSheet";
import { ExerciseList } from "./ExerciseList";
import { ExerciseSheet } from "./ExerciseSheet";
import { SplitEditorSheet } from "./SplitEditorSheet";
import { RenameExerciseSheet } from "./RenameExerciseSheet";
import { CardioSection } from "./CardioSection";
import { StatsTab } from "./StatsTab";
import { HistoryTab } from "./HistoryTab";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

type SubTab = "log" | "stats" | "history";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "log", label: "Log" },
  { key: "stats", label: "Stats" },
  { key: "history", label: "History" },
];

export function GymPage() {
  const { user } = useAuth();
  const { split, isPending: splitPending } = useSplit();

  // The most recently logged day, for the rest-day fallback in useGymDay.
  const { data: lastLogged } = useQuery({
    queryKey: ["lastLoggedDay", user?.id ?? "anon"],
    queryFn: async () => (await gymApi.getSessions({ limit: 1 }))[0]?.day_type ?? null,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { dayType, date, selectDay, selectDate, jumpTo } = useGymDay(split, splitPending, lastLogged);

  // Home's Start/Continue names the day it shows, which on a swapped day is not
  // the scheduled one, and sends it here. Applied once, on arrival; jumpTo
  // latches, so the schedule and the rest-day fallback cannot pull it back.
  const location = useLocation();
  const sentDay = (location.state as { gymDay?: number } | null)?.gymDay;
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || sentDay === undefined) return;
    arrived.current = true;
    jumpTo(sentDay, toLocalISO());
  }, [sentDay, jumpTo]);
  const { exercises, addExercise, deleteExercise, reorder, renameExercise } = useExercises(dayType);
  const { session, sets, logSet, deleteSet } = useWorkoutDay(dayType, date);
  const { byName: lastTimes, isPending: lastPending } = useLastTimes(exercises.map((e) => e.exercise_name), date);
  // The list rows want the sets alone; the sheet wants the date as well.
  const lastSets = useMemo(
    () => Object.fromEntries(Object.entries(lastTimes).map(([name, t]) => [name, t.sets])),
    [lastTimes],
  );
  const historyNames = useHistoryExerciseNames();

  const [tab, setTab] = useState<SubTab>("log");
  const [editMode, setEditMode] = useState(false);
  const [active, setActive] = useState<Exercise | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [dayPicker, setDayPicker] = useState(false);

  const activeSets = active
    ? sets.filter((s) => s.exercise_name === active.exercise_name).sort((a, b) => a.set_number - b.set_number)
    : [];

  // After every hook, before anything derived from dayType. The same rule Home
  // follows: an unloaded split is indistinguishable from a default one, so
  // rendering now would name the default split's day and fire the exercises
  // query for it, then again for the real one.
  if (splitPending) return <Spinner label="Loading your split" />;

  return (
    <div className="space-y-3">
      <GymHeader
        date={date}
        onDate={selectDate}
        dayName={getDayName(split, dayType)}
        onPickDay={() => setDayPicker(true)}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
        onEditSplit={() => setSplitOpen(true)}
      />

      {/* The header above stays on ALL three tabs. It is the page's context,
          and hiding it on History would make the Edit-in-Log hand-off look like
          it did nothing. */}
      <div className="flex rounded-full border border-edge p-0.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "flex-1 rounded-full py-1.5 text-xs font-medium",
              // Tinted: a selection, not the screen's action.
              tab === t.key ? "bg-accent/10 text-accent" : "text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab />}

      {tab === "history" && (
        <HistoryTab
          onEditInLog={(s) => {
            // jumpTo sets both AND latches, so a slow lastLoggedDay query cannot
            // pull the user back to today's rotation slot after the hand-off.
            // A plain selectDay + selectDate pair would reintroduce exactly the
            // v1 bug phase 6 fixed.
            jumpTo(s.day_type, s.date);
            setTab("log");
          }}
        />
      )}

      {tab === "log" && (
        <>
          <ExerciseList
            exercises={exercises}
            sets={sets}
            lastSets={lastSets}
            lastPending={lastPending}
            editMode={editMode}
            onOpen={setActive}
            onDelete={(id) => deleteExercise.mutate(id)}
            onReorder={(ids) => reorder.mutate(ids)}
            onRename={setRenaming}
            onAdd={(name) => addExercise.mutate(name)}
            historyNames={historyNames.data ?? []}
          />

          {!editMode && <CardioSection sessionId={session?.id ?? null} date={date} dayType={dayType} />}
        </>
      )}

      <ExerciseSheet
        exercise={active}
        todaySets={activeSets}
        last={active ? (lastTimes[active.exercise_name] ?? null) : null}
        lastPending={lastPending}
        onClose={() => setActive(null)}
        onLogSet={(weightKg, reps, isBodyweight, setNumber) => {
          if (!active) return;
          logSet.mutate({
            exercise_name: active.exercise_name,
            set_number: setNumber,
            weight_kg: weightKg,
            is_bodyweight: isBodyweight,
            ...(typeof reps === "number" ? { reps } : { reps_left: reps.left, reps_right: reps.right }),
          });
        }}
        onDeleteSet={(id) => deleteSet.mutate(id)}
      />

      <RenameExerciseSheet
        oldName={renaming}
        dayType={dayType}
        onClose={() => setRenaming(null)}
        isPending={renameExercise.isPending}
        onRename={(newName) => {
          if (renaming) renameExercise.mutate({ oldName: renaming, newName });
          setRenaming(null);
        }}
      />

      <SplitEditorSheet open={splitOpen} onClose={() => setSplitOpen(false)} />

      <DayPickerSheet
        open={dayPicker}
        days={split.days}
        selected={dayType}
        onPick={selectDay}
        onClose={() => setDayPicker(false)}
      />
    </div>
  );
}
