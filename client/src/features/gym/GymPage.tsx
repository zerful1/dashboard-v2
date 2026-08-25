import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Check, SlidersHorizontal } from "lucide-react";
import { getDayName } from "@dashboard/shared";
import type { Exercise } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { useSplit } from "@/hooks/useSplit";
import { useGymDay } from "@/hooks/useGymDay";
import { useExercises } from "@/hooks/useExercises";
import { useWorkoutDay } from "@/hooks/useWorkoutDay";
import { DaySelector } from "./DaySelector";
import { DateSelector } from "@/components/ui/DateSelector";
import { ExerciseList } from "./ExerciseList";
import { ExerciseSheet } from "./ExerciseSheet";
import { SplitEditorSheet } from "./SplitEditorSheet";
import { RenameExerciseSheet } from "./RenameExerciseSheet";
import { CardioSection } from "./CardioSection";
import { StatsTab } from "./StatsTab";
import { HistoryTab } from "./HistoryTab";
import { cn } from "@/lib/cn";

type SubTab = "log" | "stats" | "history";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "log", label: "Log" },
  { key: "stats", label: "Stats" },
  { key: "history", label: "History" },
];

export function GymPage() {
  const { user } = useAuth();
  const { split } = useSplit();

  // The most recently logged day, for the rest-day fallback in useGymDay.
  const { data: lastLogged } = useQuery({
    queryKey: ["lastLoggedDay", user?.id ?? "anon"],
    queryFn: async () => (await gymApi.getSessions({ limit: 1 }))[0]?.day_type ?? null,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { dayType, date, selectDay, selectDate, jumpTo } = useGymDay(split, lastLogged);
  const { exercises, addExercise, deleteExercise, reorder, renameExercise } =
    useExercises(dayType);
  const { session, sets, lastSets, logSet, deleteSet } = useWorkoutDay(dayType, date);

  const [tab, setTab] = useState<SubTab>("log");
  const [editMode, setEditMode] = useState(false);
  const [active, setActive] = useState<Exercise | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);

  const activeSets = active
    ? sets
        .filter((s) => s.exercise_name === active.exercise_name)
        .sort((a, b) => a.set_number - b.set_number)
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <DaySelector days={split.days} selected={dayType} onChange={selectDay} />
        </div>
        <button
          onClick={() => setSplitOpen(true)}
          aria-label="Edit split"
          className="shrink-0 rounded-lg p-2 text-muted"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          onClick={() => setEditMode((v) => !v)}
          aria-label={editMode ? "Done editing" : "Edit exercises"}
          className={cn(
            "shrink-0 rounded-lg p-2",
            editMode ? "bg-accent/10 text-accent" : "text-muted",
          )}
        >
          {editMode ? <Check size={16} /> : <Pencil size={16} />}
        </button>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="lbl text-accent">Gym</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {getDayName(split, dayType)}
          </h1>
        </div>
        <DateSelector value={date} onChange={selectDate} />
      </div>

      {/* The day selector and date picker above stay visible on ALL three tabs.
          They are the page's context, and hiding them on History would make the
          Edit-in-Log hand-off look like it did nothing. */}
      <div className="flex rounded-lg border border-raised bg-surface p-0.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "flex-1 rounded-md py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
              // Tinted — a selection, not the screen's action.
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
            editMode={editMode}
            onOpen={setActive}
            onDelete={(id) => deleteExercise.mutate(id)}
            onReorder={(ids) => reorder.mutate(ids)}
            onRename={setRenaming}
            onAdd={(name) => addExercise.mutate(name)}
          />

          {!editMode && (
            <CardioSection sessionId={session?.id ?? null} date={date} dayType={dayType} />
          )}
        </>
      )}

      <ExerciseSheet
        exercise={active}
        todaySets={activeSets}
        lastSets={active ? (lastSets[active.exercise_name] ?? []) : []}
        onClose={() => setActive(null)}
        onLogSet={(weightKg, reps, isBodyweight, setNumber) => {
          if (!active) return;
          logSet.mutate({
            exercise_name: active.exercise_name,
            set_number: setNumber,
            weight_kg: weightKg,
            reps,
            is_bodyweight: isBodyweight,
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
    </div>
  );
}
