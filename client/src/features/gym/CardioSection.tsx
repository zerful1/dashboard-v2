import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { cardioLine } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCardio } from "@/hooks/useCardio";

const FIELDS = [
  { key: "distance_miles", label: "Distance (mi)" },
  { key: "duration_minutes", label: "Duration (min)" },
  { key: "speed", label: "Speed" },
  { key: "incline", label: "Incline" },
  { key: "calories_burned", label: "Calories" },
] as const;

export function CardioSection({
  sessionId,
  date,
  dayType,
}: {
  sessionId: string | null;
  date: string;
  dayType: number;
}) {
  const { entries, addCardio, deleteCardio } = useCardio(sessionId, date, dayType);
  const [open, setOpen] = useState(false);
  const [exercise, setExercise] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const num = (k: string) => {
    const v = Number.parseFloat(values[k] ?? "");
    return Number.isFinite(v) ? v : null;
  };

  const submit = () => {
    if (!exercise.trim()) return;
    addCardio.mutate({
      exercise: exercise.trim(),
      distance_miles: num("distance_miles"),
      duration_minutes: num("duration_minutes"),
      speed: num("speed"),
      incline: num("incline"),
      calories_burned: num("calories_burned"),
    });
    setExercise("");
    setValues({});
    setOpen(false);
  };

  return (
    <div className="overflow-hidden rounded-card border border-raised bg-surface">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between gap-2 border-b border-raised px-3 py-2.5"
        >
          <span className="truncate text-xs text-text">{cardioLine(e)}</span>
          <button
            onClick={() => deleteCardio.mutate(e.id)}
            aria-label={`Delete ${e.exercise}`}
            className="shrink-0 p-1 text-negative"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-3 text-muted"
      >
        <span className="lbl">{entries.length > 0 ? "Add another" : "Add cardio"}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-raised px-3 pb-3 pt-3">
          <Input
            placeholder="Exercise (e.g. Treadmill)"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
            aria-label="Cardio exercise"
          />
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`cardio-${key}`} className="lbl">
                  {label}
                </label>
                <Input
                  id={`cardio-${key}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button
            className="w-full"
            onClick={submit}
            disabled={!exercise.trim()}
            loading={addCardio.isPending}
          >
            Log cardio
          </Button>
          {/* No "log a set first" guard, unlike v1 — POST /api/cardio creates
              the session itself, exactly as logging a set does, so a
              cardio-only day works. */}
        </div>
      )}
    </div>
  );
}
