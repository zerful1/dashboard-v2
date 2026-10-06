import { describe, it, expect } from "vitest";
import { cn } from "../src/lib/cn";

describe("cn", () => {
  // tailwind-merge reads an unknown text-* class as a colour, so without the
  // config the label size vanished beside any text colour.
  it("keeps the label size token beside a text colour", () => {
    expect(cn("text-label", "text-accent").split(" ").sort()).toEqual(["text-accent", "text-label"]);
  });

  it("still lets a later font size replace the label size", () => {
    expect(cn("text-label", "text-sm")).toBe("text-sm");
  });

  it("leaves the app's own utilities alone", () => {
    expect(cn("figure", "text-3xl", "lbl").split(" ").sort()).toEqual(["figure", "lbl", "text-3xl"]);
  });
});
