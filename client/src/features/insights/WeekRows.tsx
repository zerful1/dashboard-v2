import type { ReactNode } from "react";
import { trendTone, type WeeklyReview } from "@dashboard/shared";
import { spokenDate } from "@/lib/dates";
import { percentChange, signed } from "./format";
import { FoodBars, TrainingDots, WeekdayRow, WeightDots } from "./WeekStrips";

const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "Monday, Tuesday and Friday". */
const days = (dates: string[]) => {
  const names = dates.map((d) => spokenDate(d).split(" ")[0]!);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
};

/** The empty "—": decoration, so dim (CLAUDE.md). */
const Dash = () => <span className="text-dim">—</span>;

function Row({ label, figure, sub, spoken, strip }: { label: string; figure: ReactNode; sub: ReactNode; spoken: string; strip: ReactNode }) {
  return (
    <section aria-label={label} className="flex items-end justify-between gap-4 border-t border-raised py-3">
      <div className="min-w-0">
        <div className="lbl">{label}</div>
        <div className="figure mt-1 text-3xl">{figure}</div>
        <div className="tnum mt-1 text-xs text-muted">{sub}</div>
        {/* What the strip shows, in words; empty when the line above already says it. */}
        {spoken && <p className="sr-only">{spoken}</p>}
      </div>
      <div className="shrink-0 pb-1">{strip}</div>
    </section>
  );
}

/** Last week's training, food and weight, each beside its strip (redesign part 6, §3). */
export function WeekRows({ review, goalKg }: { review: WeeklyReview; goalKg: number | null }) {
  const { current: c, previous: p, trainingTarget, foodTarget: t } = review;
  const small = (s: string) => <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">{s}</span>;

  const change = percentChange(c.training.volume, p.training.volume);
  const trained = review.days.filter((d) => d.trained).map((d) => d.date);
  const over = t ? review.days.filter((d) => d.kcal !== null && d.kcal > t.calories).map((d) => d.date) : [];
  const weighed = review.days.filter((d) => d.weightKg !== null).map((d) => d.date);
  const avgOver = t !== null && c.food.avgKcal !== null && c.food.avgKcal > t.calories;
  const now = c.weight.average;
  const before = p.weight.average;
  // From the change as shown: 80.52 against 80.49 reads "0.0", with no arrow and no colour.
  const diff = now !== null && before !== null ? Math.round((now - before) * 10) / 10 : null;
  const tone = diff === null ? null : diff === 0 ? "neutral" : trendTone(before!, now!, goalKg);

  return (
    <div>
      <Row
        label="Training"
        figure={<>{c.training.days}{small(trainingTarget > 0 ? `of ${trainingTarget} days` : c.training.days === 1 ? "day" : "days")}</>}
        sub={`${plural(c.training.sets, "set", "sets")} · ${n0(c.training.volume)} kg${change ? ` (${change})` : ""}`}
        spoken={trained.length ? `Trained ${days(trained)}` : "No training"}
        strip={<TrainingDots days={review.days} />}
      />
      <Row
        label="Food"
        figure={
          c.food.avgKcal === null ? (
            <Dash />
          ) : (
            <>
              <span data-tone={avgOver ? "over" : undefined} className={avgOver ? "text-caution" : undefined}>{n0(c.food.avgKcal)}</span>
              {small("avg kcal")}
            </>
          )
        }
        sub={
          c.food.avgKcal === null || c.food.avgProteinG === null
            ? "No food logged"
            : [
                t && `of ${n0(t.calories)}`,
                `${n0(c.food.avgProteinG)}${t ? ` of ${n0(t.proteinG)}` : ""} g protein`,
                `${plural(c.food.daysLogged, "day", "days")} logged`,
              ].filter(Boolean).join(" · ")
        }
        spoken={over.length ? `Over target on ${days(over)}` : c.food.daysLogged ? "No day over target" : ""}
        strip={<FoodBars days={review.days} target={t?.calories ?? null} />}
      />
      <Row
        label="Weight"
        figure={now === null ? <Dash /> : <>{now.toFixed(1)}{small("avg kg")}</>}
        sub={
          now === null ? (
            "No weigh-ins"
          ) : (
            <>
              {before !== null && (
                <span data-tone={tone ?? undefined} className={tone === "good" ? "text-good" : "text-text"}>
                  {diff !== 0 && <span aria-hidden className="mr-1">{diff! < 0 ? "▼" : "▲"}</span>}
                  {signed(diff!, 1)}
                </span>
              )}
              {before !== null && " · "}
              {plural(c.weight.weighIns, "weigh-in", "weigh-ins")}
            </>
          )
        }
        spoken={weighed.length ? `Weighed in on ${days(weighed)}` : ""}
        strip={
          <div className="flex flex-col items-end gap-1">
            <WeightDots days={review.days} />
            <WeekdayRow days={review.days} />
          </div>
        }
      />
    </div>
  );
}
