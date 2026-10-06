import { useEffect, useState } from "react";
import { toLocalISO } from "@dashboard/shared";
import type { BodyWeightEntry } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { DateSelector } from "@/components/ui/DateSelector";
import type { useWeights } from "@/hooks/useWeights";

export function LogWeightCard({
  save,
  entries,
}: {
  save: ReturnType<typeof useWeights>["saveWeight"];
  entries: BodyWeightEntry[];
}) {
  // Defaults to today, but is not pinned to it — backfilling from a notes app
  // is a real use, and v1 supported it.
  const [date, setDate] = useState(() => toLocalISO());
  const existing = entries.find((e) => e.date === date)?.weight_kg ?? null;

  const [kg, setKg] = useState(existing?.toString() ?? "");

  /**
   * Reload the input when the DATE changes — and only then.
   *
   * useState's initialiser runs once, so without this the previous date's value
   * would linger after switching. Depending on `existing` as well would let a
   * background refetch overwrite whatever is being typed.
   */
  useEffect(() => {
    setKg(existing?.toString() ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const parsed = Number.parseFloat(kg);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 500;

  const submit = () => {
    if (!valid) return;
    save.mutate({ date, weight_kg: parsed });
  };

  const isToday = date === toLocalISO();

  return (
    <div className="border-t border-raised py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="lbl">{existing === null ? "Log weight" : "Edit entry"}</span>
        <DateSelector value={date} onChange={setDate} />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field
            label="Weight (kg)"
            htmlFor="log-kg"
            // Says out loud which day is being written, so a backfill cannot
            // silently land on the wrong date.
            hint={isToday ? undefined : `Saving to ${date}`}
          >
            <Input
              id="log-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="82.4"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </Field>
        </div>
        {/* The one accent action on this screen. */}
        <Button onClick={submit} loading={save.isPending} disabled={!valid}>
          {existing === null ? "Log" : "Update"}
        </Button>
      </div>
    </div>
  );
}
