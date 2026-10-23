import type { Goal, Projection } from "@dashboard/shared";
import { dayMonth, signed } from "./format";

/** One honest sentence per projection status. */
export function projectionText(p: Projection, kind: Goal["kind"], today: string): string {
  switch (p.status) {
    case "projected":
      // Dates round down to their Monday, so one later this week would read as
      // a date already past: say "this week" instead.
      return `${p.date <= today ? "this week" : `around ${dayMonth(p.date, today)}`} · ${signed(p.ratePerWeek, 1)} kg a week`;
    case "reached":
      return "Reached";
    case "not-enough-data":
      return `Not enough data yet (${p.have} of ${p.need} ${kind === "weight" ? "weigh-ins" : "sessions"})`;
    case "away":
      return `Trending away from this goal (${signed(p.ratePerWeek, 1)} kg a week)`;
    case "flat":
      return "Flat at this rate";
    case "over-a-year":
      return "Over a year away at this rate";
  }
}
