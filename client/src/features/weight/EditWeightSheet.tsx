import { useState, useEffect } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import type { BodyWeightEntry } from "@dashboard/shared";
import type { useWeights } from "@/hooks/useWeights";

export function EditWeightSheet({
  entry,
  onClose,
  save,
  remove,
}: {
  entry: BodyWeightEntry | null;
  onClose: () => void;
  save: ReturnType<typeof useWeights>["saveWeight"];
  remove: ReturnType<typeof useWeights>["deleteWeight"];
}) {
  const [kg, setKg] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (entry) {
      setKg(entry.weight_kg.toString());
      setNotes(entry.notes ?? "");
    }
  }, [entry]);

  const parsed = Number.parseFloat(kg);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 500;

  return (
    <Sheet open={!!entry} onClose={onClose} title={entry ? `Edit ${entry.date}` : ""}>
      <div className="space-y-3">
        <Field label="Weight (kg)" htmlFor="edit-kg">
          <Input
            id="edit-kg"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="edit-notes">
          <Input id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={!valid}
            loading={save.isPending}
            onClick={() => {
              if (!entry) return;
              // The date is deliberately not editable: it is the upsert key, so
              // changing it would create a second row rather than move this
              // one, and the original would still be sitting in the list.
              save.mutate({ date: entry.date, weight_kg: parsed, notes: notes || null });
              onClose();
            }}
          >
            Save
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              if (entry) {
                remove.mutate(entry.id);
                onClose();
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
