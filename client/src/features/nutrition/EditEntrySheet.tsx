import { useEffect, useRef, useState } from "react";
import type { FoodLogEntry } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { parseDecimal } from "@/lib/number";
import type { useDiary } from "@/hooks/useDiary";

export function EditEntrySheet({
  entry,
  onClose,
  rescale,
  remove,
}: {
  entry: FoodLogEntry | null;
  onClose: () => void;
  rescale: ReturnType<typeof useDiary>["rescaleEntry"];
  remove: ReturnType<typeof useDiary>["removeEntry"];
}) {
  const [raw, setRaw] = useState("");
  // One action per opening. The sheet closes on Save or Delete, but its exit
  // animation keeps it mounted and clickable for a moment, so a second tap sent
  // a second request: the same guard as AmountStep's.
  const acted = useRef(false);
  useEffect(() => {
    if (entry) {
      setRaw(String(entry.quantity));
      acted.current = false;
    }
  }, [entry]);

  const parsed = parseDecimal(raw);
  const quantity = parsed !== null && parsed > 0 && parsed <= 100000 ? parsed : null;
  // The snapshot is linear in quantity; the server scales it the same way.
  const kcal = entry && quantity !== null ? Math.round((entry.calories * quantity) / entry.quantity) : null;

  return (
    <Sheet open={!!entry} onClose={onClose} title={entry ? entry.name : ""}>
      <div className="space-y-3">
        <Field
          label={entry?.unit === "g" ? "Amount (g)" : "Servings"}
          htmlFor="edit-amount"
          hint="To switch between grams and servings, delete this and add it again."
        >
          <Input id="edit-amount" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </Field>
        <p className="tnum text-sm text-muted">{kcal === null ? "Enter an amount" : `${kcal} kcal`}</p>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={quantity === null}
            onClick={() => {
              if (!entry || quantity === null || acted.current) return;
              acted.current = true;
              rescale.mutate({ id: entry.id, quantity });
              onClose();
            }}
          >
            Save
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!entry || acted.current) return;
              acted.current = true;
              remove.mutate(entry.id);
              onClose();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
