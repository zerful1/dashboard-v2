import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const CSS = readFileSync(clientPath("src/styles.css"), "utf8");
const HTML = readFileSync(clientPath("src/index.html"), "utf8");

/** The body of the first `@media (max-width: 600px)` block, braces balanced. */
function phoneBlock(css: string): string {
  const start = css.indexOf("@media (max-width: 600px)");
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

/**
 * iOS let the page pan sideways (2026-10-06). jsdom has no layout, so these pin
 * the two fixes in the stylesheet; the browser pass measures them.
 */
describe("the page fits the phone's width", () => {
  // sonner's phone rule sets the toast strip to width: 100% AND left: 16px, so
  // it ran 16px past the right edge while a toast showed — and WebKit, unlike
  // Chromium, pans the page for a fixed element that overflows.
  it("keeps the toast strip between its margins on phones", () => {
    const block = phoneBlock(CSS);
    expect(block).toMatch(/\[data-sonner-toaster\]\s*\{[^}]*width:\s*auto/);
    expect(block).toMatch(/\[data-sonner-toast\]\s*\{[^}]*width:\s*100%/);
  });

  // A double tap zoomed the page on iOS, and a zoomed page pans sideways. On
  // every element, not just html: touch-action is combined only up to the
  // nearest scrolling ancestor, and here that is <main> or a sheet's body.
  it("stops a double tap from zooming the page, wherever it lands", () => {
    expect(CSS).toMatch(/:where\(\*\)\s*\{[^}]*touch-action:\s*manipulation/);
  });

  // The positive complement: pinch zoom stays (WCAG 1.4.4), so the fix is
  // touch-action, never a locked viewport.
  it("still lets people pinch to zoom", () => {
    expect(HTML).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });
});
