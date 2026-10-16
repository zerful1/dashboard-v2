import type { Goal, NutritionTarget, SplitConfig } from "@dashboard/shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "5 days, rest Wed · Sun": the week's training days, and its rest days by name. */
export function splitText(split: SplitConfig): string {
  const rest = split.week.flatMap((slot, i) => (slot === "rest" ? [WEEKDAYS[i]!] : []));
  const days = plural(split.week.length - rest.length, "day", "days");
  return rest.length ? `${days}, rest ${rest.join(" · ")}` : days;
}

/** "2,402 kcal · 180 g protein", or "Not set". */
export function targetText(t: NutritionTarget | null): string {
  return t ? `${n0(t.calories)} kcal · ${n0(t.protein_g)} g protein` : "Not set";
}

/** "78 kg · 1 lift": the weight goal, then how many lift goals. */
export function goalsText(goals: Goal[]): string {
  const weight = goals.find((g) => g.kind === "weight");
  const lifts = goals.filter((g) => g.kind === "lift").length;
  const parts = [weight && `${weight.target_kg} kg`, lifts > 0 && plural(lifts, "lift", "lifts")].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not set";
}

export function habitsText(n: number): string {
  return n === 0 ? "No habits" : plural(n, "habit", "habits");
}
