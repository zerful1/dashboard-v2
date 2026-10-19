import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const CSS = readFileSync(clientPath("src/styles.css"), "utf8");

/**
 * Recharts makes its chart focusable, so tapping the Weight chart left a focus
 * box around it (#37). jsdom has no layout or focus heuristics, so this pins
 * the stylesheet; the browser pass taps the chart.
 */
describe("the chart's focus outline", () => {
  it("is hidden for pointer focus on the chart", () => {
    expect(CSS).toMatch(
      /\.recharts-wrapper:focus:not\(:focus-visible\),\s*\.recharts-surface:focus:not\(:focus-visible\)\s*\{[^}]*outline:\s*none/,
    );
  });

  // The positive complement: the keyboard still sees where focus is.
  it("is kept for keyboard focus", () => {
    expect(CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/);
    expect(CSS).not.toMatch(/\.recharts-(wrapper|surface):focus-visible\s*\{[^}]*outline:\s*none/);
  });
});
