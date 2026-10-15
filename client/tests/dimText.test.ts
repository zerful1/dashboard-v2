import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { clientPath } from "./clientRoot";

const SRC = clientPath("src");

/**
 * `dim` (#555, 2.8:1 on black) is decoration only; anything a person reads is
 * `muted` (6.1:1) or brighter (redesign spec §1: every text colour ≥ 4.5:1).
 * The remaining uses, counted per file so a new one is a decision.
 */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "components/ui/Button.tsx": { count: 1, why: "disabled text: not for reading" },
  "components/ui/Input.tsx": { count: 1, why: "placeholder: the label carries the meaning" },
  "features/gym/ExerciseRow.tsx": { count: 1, why: "the row's chevron icon" },
  "layout/AppLayout.tsx": { count: 1, why: "the More sheet's chevrons" },
  "features/nutrition/WeekStrip.tsx": { count: 1, why: "the — under a day with nothing logged" },
  "features/weight/PeriodList.tsx": { count: 1, why: "the — for no change, and for a week with nothing yet" },
  "features/weight/WeightHeadline.tsx": { count: 1, why: "the — figure with no weigh-in in 7 days" },
  "features/insights/WeekRows.tsx": { count: 1, why: "the — figure for a row with nothing that week" },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("dim text", () => {
  it("is used only for decoration, never for words to read", () => {
    const counts = Object.fromEntries(
      files(SRC)
        .map((f) => [relative(SRC, f).replaceAll("\\", "/"), (readFileSync(f, "utf8").match(/\btext-dim\b/g) ?? []).length] as const)
        .filter(([, n]) => n > 0),
    );
    const allowed = Object.fromEntries(Object.entries(ALLOWED).map(([f, a]) => [f, a.count]));
    expect(counts).toEqual(allowed);
  });
});
