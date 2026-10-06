import { useState, type ChangeEvent } from "react";
import type { FoodInput } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { parseDecimal } from "@/lib/number";

type Basis = "100g" | "serving";
const EMPTY = {
  name: "", brand: "", servingDescription: "", servingGrams: "",
  kcal: "", protein: "", fat: "", carbs: "", fibre: "", sugar: "", satFat: "", salt: "",
};

/** A label typed in by hand: per 100 g, or per serving for things with no known weight. */
export function CustomFoodForm({ onNext, barcode = null }: { onNext: (food: FoodInput) => void; barcode?: string | null }) {
  const [basis, setBasis] = useState<Basis>("100g");
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  // Blank macros are 0 (a label that omits fat has none worth logging);
  // blank label nutrients are unknown.
  const macro = (s: string) => Math.max(0, parseDecimal(s) ?? 0);
  const label = (s: string) => {
    const n = parseDecimal(s);
    return n === null || n < 0 ? null : n;
  };
  const kcal = parseDecimal(f.kcal);
  const valid = f.name.trim() !== "" && kcal !== null && kcal >= 0;

  const next = () => {
    if (!valid) return;
    const per100 = basis === "100g";
    const values = {
      kcal: kcal!, protein: macro(f.protein), fat: macro(f.fat), carbs: macro(f.carbs),
      fibre: label(f.fibre), sugar: label(f.sugar), satFat: label(f.satFat), salt: label(f.salt),
    };
    onNext({
      source: "manual",
      external_id: null,
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      barcode,
      serving_description: per100 ? null : f.servingDescription.trim() || "1 serving",
      serving_grams: per100 ? null : label(f.servingGrams),
      kcal_per_serving: per100 ? null : values.kcal,
      protein_per_serving: per100 ? null : values.protein,
      fat_per_serving: per100 ? null : values.fat,
      carbs_per_serving: per100 ? null : values.carbs,
      kcal_per_100g: per100 ? values.kcal : null,
      protein_per_100g: per100 ? values.protein : null,
      fat_per_100g: per100 ? values.fat : null,
      carbs_per_100g: per100 ? values.carbs : null,
      fibre_per_100g: per100 ? values.fibre : null,
      sugar_per_100g: per100 ? values.sugar : null,
      sat_fat_per_100g: per100 ? values.satFat : null,
      salt_per_100g: per100 ? values.salt : null,
      fibre_per_serving: per100 ? null : values.fibre,
      sugar_per_serving: per100 ? null : values.sugar,
      sat_fat_per_serving: per100 ? null : values.satFat,
      salt_per_serving: per100 ? null : values.salt,
    });
  };

  const num = (id: keyof typeof EMPTY, text: string) => (
    <Field label={text} htmlFor={`custom-${id}`}>
      <Input id={`custom-${id}`} inputMode="decimal" value={f[id]} onChange={set(id)} />
    </Field>
  );

  return (
    <div className="space-y-3">
      {barcode && <p className="tnum text-xs text-muted">Barcode {barcode}, saved with this food</p>}
      <Field label="Name" htmlFor="custom-name">
        <Input id="custom-name" value={f.name} onChange={set("name")} />
      </Field>
      <Field label="Brand (optional)" htmlFor="custom-brand">
        <Input id="custom-brand" value={f.brand} onChange={set("brand")} />
      </Field>
      <div className="flex gap-2">
        <Button variant={basis === "100g" ? "selected" : "subtle"} onClick={() => setBasis("100g")}>
          Per 100 g
        </Button>
        <Button variant={basis === "serving" ? "selected" : "subtle"} onClick={() => setBasis("serving")}>
          Per serving
        </Button>
      </div>
      {basis === "serving" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serving" htmlFor="custom-servingDescription">
            <Input id="custom-servingDescription" placeholder="1 wrap" value={f.servingDescription} onChange={set("servingDescription")} />
          </Field>
          {num("servingGrams", "Weight (g, optional)")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {num("kcal", "Calories (kcal)")}
        {num("protein", "Protein (g)")}
        {num("carbs", "Carbs (g)")}
        {num("fat", "Fat (g)")}
      </div>
      <details className="border-t border-raised pt-3">
        <summary className="cursor-pointer text-xs text-muted">Label nutrients (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {num("fibre", "Fibre (g)")}
          {num("sugar", "Sugar (g)")}
          {num("satFat", "Sat fat (g)")}
          {num("salt", "Salt (g)")}
        </div>
      </details>
      <Button className="w-full" disabled={!valid} onClick={next}>
        Next
      </Button>
    </div>
  );
}
