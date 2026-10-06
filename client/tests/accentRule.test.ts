import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { clientPath } from "./clientRoot";

const SRC = clientPath("src");

/**
 * Where a SOLID white fill (bg-accent, not bg-accent/10) may appear, and why
 * (redesign spec §3). Anything else filled white reads as a second action.
 */
const ALLOWED: Record<string, string> = {
  "components/ui/Button.tsx": "the primary variant: the one action",
  "features/home/TodayCard.tsx": "the Log link, a primary action outside Button",
  "features/home/WeekTile.tsx": "week dots: small done marks",
  "features/gym/ExerciseRow.tsx": "the set-done tick",
  "features/habits/TodayHabitsCard.tsx": "habit ticks",
  "features/habits/HabitRow.tsx": "habit ticks on the week strip",
  "layout/BottomTabs.tsx": "the active tab's dot: identity chrome",
  "features/nutrition/SummaryCard.tsx": "the macro bars' fill: data, inside its track",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith(".tsx") ? [path] : [];
  });
}

describe("the accent rule", () => {
  it("fills white only the one action, done marks and identity chrome", () => {
    const solid = /\bbg-accent(?![/\w-])/;
    const found = files(SRC)
      .filter((f) => solid.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replaceAll("\\", "/"));
    expect(found.filter((f) => !(f in ALLOWED))).toEqual([]);
  });

  // The positive complement: a pattern that matched nothing would pass above.
  it("does find the primary button's fill", () => {
    expect(readFileSync(join(SRC, "components/ui/Button.tsx"), "utf8")).toMatch(/\bbg-accent(?![/\w-])/);
  });
});
