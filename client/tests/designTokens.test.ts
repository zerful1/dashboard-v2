import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const CSS = readFileSync(clientPath("src/styles.css"), "utf8");

function token(name: string): string {
  const m = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`--color-${name} is missing or not a six-digit hex`);
  return m[1]!.toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("the palette (redesign spec §3)", () => {
  // Every text colour stays legible on every ground it sits on. `dim` is
  // decoration only, so it is deliberately absent.
  for (const fg of ["text", "muted", "good", "caution", "negative"]) {
    for (const ground of ["bg", "surface"]) {
      it(`${fg} on ${ground} is at least 4.5:1`, () => {
        expect(contrast(token(fg), token(ground))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("is black and white: a black page, and white as the only accent", () => {
    expect(token("bg")).toBe("#000000");
    expect(token("accent")).toBe("#ffffff");
  });

  it("names colours by their job, so sage and gold are gone", () => {
    expect(CSS).not.toMatch(/--color-(sage|gold)\b/);
  });
});
