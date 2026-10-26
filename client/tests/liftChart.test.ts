import { describe, it, expect } from "vitest";
import { LIFT_TICK, liftTick } from "../src/features/weight/WeightChart";
import { axisDomain } from "../src/lib/axisDomain";

// A fixed "dataMin - 2" domain gave decimal ticks such as 128.7,
// whose leading digit the margin clipped, so heavy lifts mislabelled their axis.
describe("LiftChart's axis", () => {
  it("rounds the domain to whole numbers around the data", () => {
    expect(axisDomain([88.67, 128.7])).toEqual([88, 129]);
    expect(axisDomain([9, 11])).toEqual([9, 11]);
  });

  it("labels ticks as whole numbers", () => {
    expect(liftTick(128.7)).toBe("129");
  });

  // CLAUDE.md: words a person reads are muted or brighter; Recharts' default is #666.
  it("draws tick text in muted", () => {
    expect(LIFT_TICK).toEqual({ fontSize: 10, fill: "var(--color-muted)" });
  });
});
