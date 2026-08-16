import { useState } from "react";
import { toLocalISO } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import type { useWeights } from "@/hooks/useWeights";

export function LogTodayCard({
  save,
  todayValue,
}: {
  save: ReturnType<typeof useWeights>["saveWeight"];
  todayValue: number | null;
}) {
  // The client resolves its own calendar day; the server never infers one.
  const today = toLocalISO();
  const [kg, setKg] = useState(todayValue?.toString() ?? "");

  const parsed = Number.parseFloat(kg);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < 500;

  return (
    <div className="rounded-card border border-raised bg-surface p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label={todayValue === null ? "Log today" : "Today"} htmlFor="today-kg">
            <Input
              id="today-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="82.4"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) {
                  save.mutate({ date: today, weight_kg: parsed });
                }
              }}
            />
          </Field>
        </div>
        {/* The one accent action on this screen. */}
        <Button
          onClick={() => save.mutate({ date: today, weight_kg: parsed })}
          loading={save.isPending}
          disabled={!valid}
        >
          {todayValue === null ? "Log" : "Update"}
        </Button>
      </div>
    </div>
  );
}
