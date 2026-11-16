import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const SHELL = readFileSync(clientPath("src/layout/AppLayout.tsx"), "utf8");

/** Every page sits in one centred column at every width; jsdom never evaluates a media query. */
describe("the content column", () => {
  it("is capped at max-w-2xl", () => {
    expect(SHELL).toMatch(/className="[^"]*\bmx-auto w-full max-w-2xl\b[^"]*"/);
  });

  it("keeps that cap at every breakpoint", () => {
    expect(SHELL.match(/\b(?:sm|md|lg|xl|2xl):max-w-[\w-[\]]+/g) ?? []).toEqual([]);
  });
});
