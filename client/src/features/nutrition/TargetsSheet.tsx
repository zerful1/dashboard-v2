import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { latestActiveTarget } from "@dashboard/shared";
import type { ActivityLevel, GoalMode, NutritionTarget, Profile, Sex, TdeeHint } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { api, ApiError } from "@/lib/api";
import { profileQuery } from "@/lib/profileQuery";
import { parseDecimal } from "@/lib/number";
import { useTdeeHint } from "@/hooks/useTdeeHint";
import type { useTargets } from "@/hooks/useTargets";

const GOALS: { id: GoalMode; label: string }[] = [
  { id: "cut", label: "Cut" },
  { id: "maintain", label: "Maintain" },
  { id: "bulk", label: "Bulk" },
];
const ACTIVITY: { id: ActivityLevel; label: string }[] = [
  { id: "sedentary", label: "Sedentary - desk job, little exercise" },
  { id: "light", label: "Light - 1 to 3 sessions a week" },
  { id: "moderate", label: "Moderate - 3 to 5 sessions a week" },
  { id: "very", label: "Very active - 6 or 7 sessions a week" },
  { id: "extra", label: "Extra - physical job plus training" },
];

const int = (raw: string) => {
  const n = parseDecimal(raw);
  return n !== null && Number.isInteger(n) ? n : null;
};

export function TargetsSheet({
  open,
  onClose,
  today,
  targets,
  addTarget,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  targets: NutritionTarget[];
  addTarget: ReturnType<typeof useTargets>["addTarget"];
}) {
  const hint = useTdeeHint(today, open);
  const [goal, setGoal] = useState<GoalMode>("cut");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");

  // Keyed on the latest target's identity, not the array: with no targets yet
  // the list is a fresh [] on every render, and depending on it wiped whatever
  // had been typed (#17 review 12).
  const latestId = latestActiveTarget(targets, today)?.id ?? null;
  useEffect(() => {
    if (!open) return;
    const t = latestActiveTarget(targets, today);
    setGoal(t?.goal_mode ?? "cut");
    setKcal(t ? String(t.calories) : "");
    setProtein(t ? String(t.protein_g) : "");
    setFat(t ? String(t.fat_g) : "");
    setCarbs(t ? String(t.carbs_g) : "");
  }, [open, latestId, today]);

  const values = { calories: int(kcal), protein_g: int(protein), fat_g: int(fat), carbs_g: int(carbs) };
  const valid =
    values.calories !== null && values.calories > 0 &&
    [values.protein_g, values.fat_g, values.carbs_g].every((v) => v !== null && v >= 0);
  const fromMacros = 4 * (values.protein_g ?? 0) + 4 * (values.carbs_g ?? 0) + 9 * (values.fat_g ?? 0);

  return (
    <Sheet open={open} onClose={onClose} title="Targets">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <HintCard hint={hint.data} />

        <div className="flex gap-2">
          {GOALS.map((g) => (
            <Button key={g.id} variant={goal === g.id ? "selected" : "ghost"} onClick={() => setGoal(g.id)}>
              {g.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories (kcal)" htmlFor="t-kcal">
            <Input id="t-kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </Field>
          <Field label="Protein (g)" htmlFor="t-protein">
            <Input id="t-protein" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </Field>
          <Field label="Carbs (g)" htmlFor="t-carbs">
            <Input id="t-carbs" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </Field>
          <Field label="Fat (g)" htmlFor="t-fat">
            <Input id="t-fat" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
          </Field>
        </div>
        <p className="tnum text-xs text-dim">Macros add up to {fromMacros.toLocaleString()} kcal</p>
        <Button
          className="w-full"
          disabled={!valid}
          onClick={() => {
            if (!valid) return;
            addTarget.mutate({
              effective_from: today,
              goal_mode: goal,
              calories: values.calories!,
              protein_g: values.protein_g!,
              fat_g: values.fat_g!,
              carbs_g: values.carbs_g!,
            });
            onClose();
          }}
        >
          Save targets
        </Button>

        <BodyDetails />
      </div>
    </Sheet>
  );
}

function HintCard({ hint }: { hint: TdeeHint | undefined }) {
  let headline: string | null = null;
  let detail: string;
  if (!hint) {
    detail = "Estimating…";
  } else if (hint.adaptive) {
    headline = `≈ ${hint.adaptive.kcal.toLocaleString()} kcal maintenance`;
    detail = `From your last ${hint.adaptive.days_logged} logged days and ${hint.adaptive.weigh_ins} weigh-ins.`;
  } else if (hint.formula) {
    headline = `≈ ${hint.formula.kcal.toLocaleString()} kcal maintenance`;
    detail =
      `Estimated from your height, age (${hint.formula.age}), sex and activity at ${hint.formula.weight_kg.toFixed(1)} kg. ` +
      `After 14 logged days this uses your own numbers instead (${hint.days_logged} so far).`;
  } else {
    detail = `Add your body details below for an estimate, or log food for 14 days (${hint.days_logged} so far).`;
  }
  return (
    <div className="rounded-lg border border-raised p-3">
      {headline && <p className="tnum text-sm font-semibold">{headline}</p>}
      <p className="mt-1 text-xs text-muted">{detail}</p>
      <p className="mt-2 text-[11px] text-dim">
        Counts every day you logged anything as a full day. An estimate, not medical advice.
      </p>
    </div>
  );
}

function BodyDetails() {
  const qc = useQueryClient();
  const profile = useQuery(profileQuery);
  const [height, setHeight] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | "">("");

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setHeight(p.height_cm?.toString() ?? "");
    setBirthYear(p.birth_year?.toString() ?? "");
    setSex(p.sex);
    setActivity(p.activity_level ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Pick<Profile, "height_cm" | "birth_year" | "sex" | "activity_level">>) =>
      api<Profile>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) }),
    // The form shows its own failure, beside the fields.
    meta: { errorToast: false },
    onSuccess: (updated) => {
      qc.setQueryData(["profile"], updated);
      void qc.invalidateQueries({ queryKey: ["tdeeHint"] });
    },
  });

  const h = parseDecimal(height);
  const y = int(birthYear);
  // A typed value that can't be saved says so, rather than being dropped while
  // the rest saves; a blank field clears its detail (#17 review 11).
  const heightError =
    height.trim() !== "" && (h === null || h < 100 || h > 250) ? "Enter a height between 100 and 250 cm" : undefined;
  const yearError =
    birthYear.trim() !== "" && (y === null || y < 1900 || y > 2100) ? "Enter a year between 1900 and 2100" : undefined;
  const patch = {
    height_cm: height.trim() === "" ? null : h,
    birth_year: birthYear.trim() === "" ? null : y,
    sex,
    activity_level: activity || null,
  };

  return (
    <details className="rounded-lg border border-raised px-3 py-2">
      <summary className="cursor-pointer text-xs text-muted">Body details (for the estimate)</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (cm)" htmlFor="b-height" error={heightError}>
            <Input id="b-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
          <Field label="Birth year" htmlFor="b-year" error={yearError}>
            <Input id="b-year" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          {(["male", "female"] as const).map((s) => (
            <Button key={s} variant={sex === s ? "selected" : "ghost"} onClick={() => setSex(sex === s ? null : s)}>
              {s === "male" ? "Male" : "Female"}
            </Button>
          ))}
        </div>
        <Field label="Activity" htmlFor="b-activity">
          <select
            id="b-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value as ActivityLevel)}
            className="w-full rounded-lg border border-raised bg-surface px-3 py-2.5 text-sm text-text"
          >
            <option value="">Choose…</option>
            {ACTIVITY.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="ghost"
          disabled={!!heightError || !!yearError}
          loading={save.isPending}
          onClick={() => save.mutate(patch)}
        >
          Save details
        </Button>
        {save.isError && (
          <FormError>{save.error instanceof ApiError ? save.error.message : "Couldn't save your details."}</FormError>
        )}
      </div>
    </details>
  );
}
