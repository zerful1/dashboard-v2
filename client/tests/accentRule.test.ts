import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { clientPath } from "./clientRoot";

const SRC = clientPath("src");

/**
 * Where a SOLID white fill may appear, and why (redesign spec §3). Anything
 * else filled white reads as a second action.
 */
const ALLOWED: Record<string, string> = {
  "components/ui/Button.tsx": "the primary variant: the one action",
  "features/home/WorkoutSection.tsx": "the Start/Continue workout link (a primary action outside Button), its progress bar (data ink) and the done tick",
  "features/home/FoodSection.tsx": "the kcal bar's fill: data ink",
  "features/home/WeekLine.tsx": "week dots: small done marks",
  "features/gym/ExerciseRow.tsx": "the set-done tick",
  "features/gym/TrainingGrid.tsx": "trained days on History's grid: small done marks",
  "features/habits/TodayHabitsCard.tsx": "habit ticks",
  "features/habits/HabitRow.tsx": "habit ticks on the week strip",
  "layout/BottomTabs.tsx": "the active tab's dot: identity chrome",
  "features/nutrition/DayFigure.tsx": "the macro bars' fill: data, inside its track",
  "features/nutrition/WeekStrip.tsx": "the bars' fill (data ink) and the protein dot (a small done mark)",
  "features/weight/PeriodList.tsx": "week dots: small done marks",
  "features/insights/WeekStrips.tsx": "days trained (small done marks) and the food bars' fill (data ink)",
  "pages/AboutPage.tsx": "the Open the app link: the one action, a link outside Button",
};

/**
 * A solid white fill. `text` and `white` are white too since the redesign, so
 * `bg-text` would slip past a guard that only knew `bg-accent`; a tint such as
 * `bg-accent/10` is a selected state and fine.
 */
const SOLID_WHITE = /\bbg-(?:accent|text|white)(?![/\w-])/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // .ts too: a class string can live in a helper as easily as in a component.
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the accent rule", () => {
  it("recognises every solid white fill, and not a tint", () => {
    for (const c of ["bg-accent", "bg-text", "bg-white", "hover:bg-accent", 'cn("x", "bg-white")']) {
      expect(SOLID_WHITE.test(c), c).toBe(true);
    }
    for (const c of ["bg-accent/10", "hover:bg-accent/5", "bg-text-muted", "bg-raised"]) {
      expect(SOLID_WHITE.test(c), c).toBe(false);
    }
  });

  it("fills white only the one action, done marks, data ink and identity chrome", () => {
    const found = files(SRC)
      .filter((f) => SOLID_WHITE.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replaceAll("\\", "/"));
    expect(found.filter((f) => !(f in ALLOWED))).toEqual([]);
  });

  // The positive complement: a pattern that matched nothing would pass above.
  it("does find the primary button's fill", () => {
    expect(readFileSync(join(SRC, "components/ui/Button.tsx"), "utf8")).toMatch(SOLID_WHITE);
  });
});
