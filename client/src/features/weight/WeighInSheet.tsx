import { useEffect, useState, type FormEvent } from "react";
import type { BodyWeightEntry } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { DateSelector } from "@/components/ui/DateSelector";
import { listDate } from "@/lib/dates";
import type { useWeights } from "@/hooks/useWeights";
import { parseWeighIn } from "./weighIn";

export type WeighInTarget = { mode: "log" } | { mode: "edit"; entry: BodyWeightEntry };

interface Props {
  target: WeighInTarget | null;
  onClose: () => void;
  entries: BodyWeightEntry[];
  /** The page's today (CLAUDE.md, one clock per page). */
  today: string;
  save: ReturnType<typeof useWeights>["saveWeight"];
  remove: ReturnType<typeof useWeights>["deleteWeight"];
}

/**
 * Logging and editing a weigh-in. Replaces the inline
 * log card and the edit sheet: Log opens it on today with the date free to
 * change; a weigh-in opens it with the date fixed.
 */
export function WeighInSheet(props: Props) {
  const { target, onClose, today } = props;
  const title = target === null ? "" : target.mode === "log" ? "Log weight" : `Edit ${listDate(target.entry.date, today)}`;
  return (
    <Sheet open={target !== null} onClose={onClose} title={title}>
      {/* A fresh form per opening: Log always starts on today, never on the
          date picked last time. */}
      {target && <WeighInForm key={target.mode === "log" ? "log" : target.entry.id} {...props} target={target} />}
    </Sheet>
  );
}

function WeighInForm({ target, onClose, entries, today, save, remove }: Props & { target: WeighInTarget }) {
  const [date, setDate] = useState(target.mode === "edit" ? target.entry.date : today);
  const existing = entries.find((e) => e.date === date) ?? (target.mode === "edit" ? target.entry : null);
  // A failed save gives back what was typed, on its date: Log closed the sheet,
  // so the form that held it is gone (Home's weigh-in does the same).
  const failed = save.isError && save.variables?.date === date ? save.variables : null;
  const fields = failed
    ? { kg: String(failed.weight_kg), notes: failed.notes ?? "" }
    : { kg: existing?.weight_kg.toString() ?? "", notes: existing?.notes ?? "" };
  const [kg, setKg] = useState(fields.kg);
  const [notes, setNotes] = useState(fields.notes);
  // The latest weigh-in by date is the likeliest next one; "82.4" only with none.
  const latest = entries.reduce<BodyWeightEntry | null>((a, e) => (a === null || e.date > a.date ? e : a), null);

  /**
   * Reload the fields when the DATE changes, and only then. Depending on
   * `existing` as well would let a background refetch overwrite what is being
   * typed (the log card's rule, carried over).
   */
  useEffect(() => {
    setKg(fields.kg);
    setNotes(fields.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const parsed = parseWeighIn(kg);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed === null) return;
    // The date is the upsert key: an edit never moves a weigh-in to another day.
    save.mutate({ date, weight_kg: parsed, notes: notes || null });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {target.mode === "log" && (
        <div className="flex items-center justify-between gap-3">
          <span className="lbl">Date</span>
          <DateSelector value={date} onChange={setDate} today={today} />
        </div>
      )}
      <Field label="Weight (kg)" htmlFor="weigh-in-kg">
        <Input
          id="weigh-in-kg"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          placeholder={latest ? latest.weight_kg.toFixed(1) : "82.4"}
          value={kg}
          onChange={(e) => setKg(e.target.value)}
        />
      </Field>
      <Field label="Notes" htmlFor="weigh-in-notes">
        <Input id="weigh-in-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={parsed === null} loading={save.isPending}>
          {target.mode === "edit" ? "Save" : existing ? "Update" : "Log"}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="danger"
            loading={remove.isPending}
            // A weigh-in still saving has an id the server never issued.
            disabled={existing.id.startsWith("optimistic-")}
            onClick={() => {
              remove.mutate(existing.id);
              onClose();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
