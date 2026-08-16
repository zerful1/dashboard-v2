import { describe, it, expect } from "vitest";
import { TRANSITIONS, springOrNone } from "../src/lib/motion";

describe("motion presets", () => {
  it("exposes exactly three named transitions", () => {
    expect(Object.keys(TRANSITIONS)).toEqual(["snappy", "smooth", "gentle"]);
  });

  it("orders them from fastest to slowest by stiffness", () => {
    // The names are only meaningful if the values agree with them. A "gentle"
    // stiffer than "snappy" would be a comment that lies, in numeric form.
    expect(TRANSITIONS.snappy.stiffness).toBeGreaterThan(TRANSITIONS.smooth.stiffness);
    expect(TRANSITIONS.smooth.stiffness).toBeGreaterThan(TRANSITIONS.gentle.stiffness);
  });

  it("collapses to an instant transition when motion is unsafe", () => {
    expect(springOrNone(TRANSITIONS.smooth, false)).toEqual({ duration: 0 });
  });

  it("passes the transition through untouched when motion is safe", () => {
    expect(springOrNone(TRANSITIONS.smooth, true)).toBe(TRANSITIONS.smooth);
  });

  it("collapses every preset, not just the one the sheet uses", () => {
    // Guards against a future preset being added without a reduced-motion path.
    for (const t of Object.values(TRANSITIONS)) {
      expect(springOrNone(t, false)).toEqual({ duration: 0 });
    }
  });
});
