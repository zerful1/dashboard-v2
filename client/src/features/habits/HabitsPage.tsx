import { useState } from "react";
import { lastSevenDays, MAX_HABITS } from "@dashboard/shared";
import { isUnsaved, useHabits } from "@/hooks/useHabits";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { HabitRow } from "./HabitRow";
import { EditHabitRow } from "./EditHabitRow";
import { AddHabitForm } from "./AddHabitForm";

/** The Habits tab: the last 7 days of each habit, streaks, and editing. */
export function HabitsPage() {
  const { habits, today, isPending, isError, hasData, refetch, setDone, add, rename, remove, reorder } = useHabits();
  const [editing, setEditing] = useState(false);
  const days = lastSevenDays(today);

  function move(i: number, by: -1 | 1) {
    const ids = habits.map((h) => h.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    reorder.mutate(ids);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="lbl text-accent">Habits</div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">Daily habits</h1>
        </div>
        {habits.length > 0 && (
          // Tinted while on: a state, not an action (the accent rule).
          <Button variant={editing ? "selected" : "ghost"} onClick={() => setEditing((e) => !e)}>
            {editing ? "Done" : "Edit"}
          </Button>
        )}
      </div>

      {isPending ? (
        <Spinner label="Loading your habits" />
      ) : isError && !hasData ? (
        <Card className="space-y-3">
          <p className="text-sm text-muted">Couldn&apos;t load your habits.</p>
          <Button onClick={() => void refetch()}>Retry</Button>
        </Card>
      ) : (
        <>
          {habits.length > 0 && (
            <Card>
              <ul className="space-y-4">
                {habits.map((h, i) =>
                  editing ? (
                    <EditHabitRow
                      key={h.id}
                      habit={h}
                      first={i === 0}
                      last={i === habits.length - 1}
                      locked={isUnsaved(h)}
                      canMove={!add.isPending}
                      onSave={(name, emoji) => rename.mutate({ id: h.id, name, emoji })}
                      onMove={(by) => move(i, by)}
                      onDelete={() => {
                        if (window.confirm(`Delete ${h.name} and its history?`)) remove.mutate(h.id);
                      }}
                    />
                  ) : (
                    <HabitRow
                      key={h.id}
                      habit={h}
                      days={days}
                      today={today}
                      locked={isUnsaved(h)}
                      onToggle={(date, done) => setDone.mutate({ id: h.id, date, done })}
                    />
                  ),
                )}
              </ul>
            </Card>
          )}
          {(editing || habits.length === 0) &&
            (habits.length >= MAX_HABITS ? (
              <p className="text-sm text-muted">You can have up to {MAX_HABITS} habits.</p>
            ) : (
              <AddHabitForm first={habits.length === 0} onAdd={(name, emoji) => add.mutate({ name, emoji })} />
            ))}
        </>
      )}
    </div>
  );
}
