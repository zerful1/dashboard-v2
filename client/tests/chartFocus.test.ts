import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const CSS = readFileSync(clientPath("src/styles.css"), "utf8");

/** Recharts makes its chart focusable, leaving a focus box on tap; jsdom has no focus heuristics. */
describe("the chart's focus outline", () => {
  it("is hidden for pointer focus on the chart", () => {
    expect(CSS).toMatch(
      /\.recharts-wrapper:focus:not\(:focus-visible\),\s*\.recharts-surface:focus:not\(:focus-visible\)\s*\{[^}]*outline:\s*none/,
    );
  });

  // Recharts 3 makes a Bar's layer focusable at tabindex -1, which Tab never reaches.
  it("is hidden on the chart's tabindex -1 layers, which only a pointer can focus", () => {
    expect(CSS).toMatch(/\.recharts-wrapper \[tabindex="-1"\]:focus\s*\{[^}]*outline:\s*none/);
  });

  // The positive complement: the keyboard still sees where focus is.
  it("is kept for keyboard focus", () => {
    expect(CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/);
    expect(CSS).not.toMatch(/\.recharts-(wrapper|surface):focus-visible\s*\{[^}]*outline:\s*none/);
  });
});
