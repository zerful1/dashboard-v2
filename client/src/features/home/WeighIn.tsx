import { useState, type FormEvent } from "react";
import { shiftISO } from "@dashboard/shared";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { prettyDate } from "@/lib/dates";
import { parseWeighIn } from "@/features/weight/weighIn";
import type { useWeights } from "@/hooks/useWeights";

/** Home's top slot before today's weigh-in: one field, and the screen's one white action. */
export function WeighIn({ latest, latestDate, today, save }: {
  latest: number | null;
  latestDate: string | null;
  today: string;
  save: ReturnType<typeof useWeights>["saveWeight"];
}) {
  // A failed save gives back what was typed. The optimistic weigh-in unmounts
  // this field and the rollback remounts it, so the value comes from the
  // mutation, not from state. The rollback is written before the error is
  // recorded, but TanStack renders it on a later tick, and the error is recorded
  // first (none of this hook's callbacks awaits a request), so the remounted
  // field already reads isError.
  const [kg, setKg] = useState(() =>
    save.isError && save.variables?.date === today ? String(save.variables.weight_kg) : "",
  );
  const parsed = parseWeighIn(kg);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed !== null) save.mutate({ date: today, weight_kg: parsed });
  };
  const when = latestDate === shiftISO(today, -1) ? "yesterday" : latestDate ? `on ${prettyDate(latestDate)}` : "";

  return (
    <Card className="py-5">
      <div className="lbl">Weigh-in</div>
      <p className="mt-1 text-xs text-muted">
        {latest === null ? "No weigh-ins yet" : `Last: ${latest.toFixed(1)} kg ${when}`}
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <Input
          aria-label="Today's weight (kg)"
          inputMode="decimal"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          placeholder={latest?.toFixed(1) ?? "kg"}
          className="tnum min-w-0 flex-1 text-lg"
        />
        <Button type="submit" disabled={parsed === null}>
          Log
        </Button>
      </form>
    </Card>
  );
}
