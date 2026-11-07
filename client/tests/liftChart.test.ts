import { describe, it, expect } from "vitest";
import type { LiftChartPoint } from "@dashboard/shared";
import { dayAt, LIFT_TICK, liftReadout, liftTick } from "../src/features/weight/WeightChart";
import { axisDomain } from "../src/lib/axisDomain";

const point = (date: string, set: Partial<LiftChartPoint["set"]>, isBest = false): LiftChartPoint => ({
  date,
  value: set.weight_kg ?? 0,
  isBest,
  set: { date, weight_kg: 0, reps: 0, reps_left: null, reps_right: null, is_bodyweight: false, ...set },
});

// A tap picks the day whose column it lands in. On a phone Recharts' own
// click carries no active day, so the chart works it out from where you tapped.
describe("LiftChart's tap target", () => {
  const plot = { x: 32, width: 320 }; // 4 days: columns of 80 px from x = 32

  it("picks the day whose column the tap lands in", () => {
    expect(dayAt(33, plot, 4)).toBe(0);
    expect(dayAt(111, plot, 4)).toBe(0);
    expect(dayAt(112, plot, 4)).toBe(1);
    expect(dayAt(351, plot, 4)).toBe(3);
  });

  it("clamps a tap in the axis gutters to the nearest day", () => {
    expect(dayAt(5, plot, 4)).toBe(0);
    expect(dayAt(360, plot, 4)).toBe(3);
  });
});

// The tap's answer: the exact set, in a fixed line that never leaves the screen.
describe("LiftChart's readout", () => {
  it("names the day and the exact set", () => {
    expect(liftReadout(point("2026-10-02", { weight_kg: 75, reps: 8 }), "2026-11-07")).toBe("2 Oct · 75 × 8");
  });

  it("says so on a new high", () => {
    expect(liftReadout(point("2026-10-02", { weight_kg: 75, reps: 8 }, true), "2026-11-07")).toBe("2 Oct · 75 × 8 · new high");
  });

  it("shows both sides, bodyweight, and the year outside today's", () => {
    expect(liftReadout(point("2026-10-02", { weight_kg: 30, reps: 9, reps_left: 10, reps_right: 9 }), "2026-11-07")).toBe(
      "2 Oct · 30 × L10 R9",
    );
    expect(liftReadout(point("2025-03-14", { reps: 12, is_bodyweight: true }), "2026-11-07")).toBe("14 Mar 2025 · BW × 12");
  });
});

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
