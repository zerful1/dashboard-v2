import { isFlatRate, projectGoal, rateTone, shiftISO, type Goal, type Projection, type TrendFit } from "@dashboard/shared";
import { dayMonth, signed } from "@/features/insights/format";

export type RateLine =
  | { kind: "rate"; arrow: "▼" | "▲"; text: string; tone: "good" | "neutral" }
  | { kind: "flat" }
  | { kind: "none"; have: number; need: number };

/** The rate as Weight and Home word it: Insights' fit, "flat" under its threshold, green only toward goal. */
export function rateLine(fit: TrendFit, goal: Pick<Goal, "target_kg" | "start_kg"> | null): RateLine {
  if (fit.status === "not-enough-data") return { kind: "none", have: fit.have, need: fit.need };
  if (isFlatRate("weight", fit.ratePerWeek)) return { kind: "flat" };
  return {
    kind: "rate",
    arrow: fit.ratePerWeek < 0 ? "▼" : "▲",
    text: `${signed(fit.ratePerWeek, 1)} kg a week`,
    tone: rateTone(fit, goal),
  };
}

/** "latest 81.8 today", "… yesterday", "… on 3 Oct". */
export function latestText(kg: number, date: string, today: string): string {
  const when = date === today ? "today" : date === shiftISO(today, -1) ? "yesterday" : `on ${dayMonth(date, today)}`;
  return `latest ${kg.toFixed(1)} ${when}`;
}

/** What follows "Goal 80 kg": the projection's status without its rate, which the line above shows. */
function goalStatus(p: Projection, today: string): string | null {
  switch (p.status) {
    case "projected":
      // Dates round down to their Monday: one later this week would read as past.
      return p.date <= today ? "this week" : `around ${dayMonth(p.date, today)}`;
    case "reached":
      return "reached";
    case "away":
      return "moving away";
    case "flat":
      return "no date at this rate";
    case "over-a-year":
      return "over a year away";
    case "not-enough-data":
      return null;
  }
}

/** "Goal 80 kg · around 16 Nov": projectGoal as Insights runs it; `stale` keeps only the target. */
export function goalLine(
  goal: Pick<Goal, "id" | "kind" | "target_kg" | "start_kg">,
  points: { date: string; kg: number }[],
  today: string,
  stale = false,
): string {
  const status = stale
    ? null
    : goalStatus(projectGoal(goal, points.map((p) => ({ date: p.date, value: p.kg })), today), today);
  return `Goal ${goal.target_kg} kg${status ? ` · ${status}` : ""}`;
}
