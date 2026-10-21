import { useRef, useState } from "react";
import { buildEntryInput, resolveLabelNutrients, resolveMacros, type FoodChoice } from "@dashboard/shared";
import type { DiaryEntryInput, FoodLogUnit } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { parseDecimal } from "@/lib/number";
import { LABEL_ROWS } from "./LabelStrip";

const MAX_AMOUNT = 100000;

export function AmountStep({
  choice,
  date,
  initial,
  onAdd,
  onBack,
}: {
  choice: FoodChoice;
  date: string;
  /** The amount last logged, when the food came from Recent. */
  initial?: { quantity: number; unit: FoodLogUnit };
  onAdd: (input: DiaryEntryInput) => void;
  onBack: () => void;
}) {
  const [servingIdx, setServingIdx] = useState(0);
  const picked = choice.servings[servingIdx] ?? choice.servings[0]!;
  // Grams need either per-100 g values or the serving's weight.
  const canWeigh = choice.per100g !== null || picked.grams > 0;

  const [unit, setUnit] = useState<FoodLogUnit>(() => initial?.unit ?? (choice.per100g ? "g" : "serving"));
  const effectiveUnit: FoodLogUnit = unit === "g" && !canWeigh ? "serving" : unit;
  const [raw, setRaw] = useState(() => String(initial?.quantity ?? (effectiveUnit === "g" ? 100 : 1)));

  // One add per step. The sheet closes on Add, but its exit animation keeps this
  // mounted and clickable for a moment, so a double tap would log it twice.
  const added = useRef(false);

  const parsed = parseDecimal(raw);
  const quantity = parsed !== null && parsed > 0 && parsed <= MAX_AMOUNT ? parsed : null;
  const m = quantity === null ? null : resolveMacros(choice, picked, quantity, effectiveUnit);
  const labels = quantity === null ? null : resolveLabelNutrients(choice, picked, quantity, effectiveUnit);

  const switchUnit = (next: FoodLogUnit) => {
    setUnit(next);
    setRaw(next === "g" ? "100" : "1");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{choice.name}</p>
          {choice.brand && <p className="truncate text-xs text-muted">{choice.brand}</p>}
        </div>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant={effectiveUnit === "g" ? "selected" : "subtle"} disabled={!canWeigh} onClick={() => switchUnit("g")}>
          g
        </Button>
        <Button variant={effectiveUnit === "serving" ? "selected" : "subtle"} onClick={() => switchUnit("serving")}>
          Serving
        </Button>
      </div>

      {effectiveUnit === "serving" && choice.servings.length > 1 && (
        <select
          aria-label="Serving size"
          value={servingIdx}
          onChange={(e) => setServingIdx(Number(e.target.value))}
          className="w-full rounded-xl border border-edge bg-surface px-3 py-2.5 text-sm text-text"
        >
          {choice.servings.map((s, i) => (
            <option key={`${s.label}-${i}`} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      <Field label={effectiveUnit === "g" ? "Amount (g)" : "Servings"} htmlFor="amount">
        <Input id="amount" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </Field>

      <p className="tnum text-sm text-muted">
        {m
          ? `${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} · C ${Math.round(m.c)} · F ${Math.round(m.f)}`
          : "Enter an amount"}
      </p>
      {labels && (
        // The label nutrients, unknown as "—", never as 0.
        <p className="tnum text-xs text-muted">
          {LABEL_ROWS.map((r) => {
            const v = labels[r.key];
            return `${r.label} ${v === null ? "—" : `${v.toFixed(r.dp)} g`}`;
          }).join(" · ")}
        </p>
      )}

      <Button
        className="w-full"
        disabled={quantity === null}
        onClick={() => {
          if (quantity === null || added.current) return;
          added.current = true;
          onAdd(buildEntryInput(choice, picked, quantity, effectiveUnit, date));
        }}
      >
        Add
      </Button>
    </div>
  );
}
