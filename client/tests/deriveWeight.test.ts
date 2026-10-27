import { describe, it, expect } from "vitest";
import { shiftISO, type BodyWeightEntry } from "@dashboard/shared";
import { deriveWeightSummary, goalPlacement, RANGES, rangeStart, type RangeId } from "../src/features/weight/deriveWeight";

const e = (date: string, kg: number): BodyWeightEntry => ({
  id: date,
  user_id: "u",
  date,
  weight_kg: kg,
  notes: null,
  created_at: "",
});

const TODAY = "2026-08-15";

describe("deriveWeightSummary", () => {
  it("takes the latest by date, not by array position", () => {
    const s = deriveWeightSummary([e("2026-08-10", 83), e("2026-08-15", 82)], TODAY);
    expect(s.latest).toBe(82);
    expect(s.latestDate).toBe("2026-08-15");
  });

  it("orders chart points oldest first regardless of input order", () => {
    const s = deriveWeightSummary([e("2026-08-15", 82), e("2026-08-01", 84)], TODAY);
    expect(s.points.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-15"]);
  });

  it("is unaffected by the machine timezone", () => {
    // Dates are strings and `today` is an argument, so there is nothing to
    // shift. 26 September is inside BST, the case that would move if any of
    // this went through a Date.
    const s = deriveWeightSummary([e("2025-09-26", 84), e("2025-09-27", 83.8)], "2025-09-27");
    expect(s.latestDate).toBe("2025-09-27");
    expect(s.points.map((p) => p.date)).toEqual(["2025-09-26", "2025-09-27"]);
  });
});

// The chart's y-range is the data ± 1 kg. A goal far outside it used to stretch
// the axis to reach it and squash the line flat; now it is
// drawn only inside the range, and named beside the chart otherwise.
describe("goalPlacement", () => {
  const pts = [{ date: "2026-09-01", kg: 84 }, { date: "2026-10-01", kg: 80.6 }];
  const line = [{ date: "2026-09-01", kg: 83.8 }, { date: "2026-10-01", kg: 80.8 }];

  it("draws a goal that falls inside the chart's range", () => {
    expect(goalPlacement(pts, line, 80)).toBe("in"); // the axis runs 80 to 84
  });
  it("names a goal just past the axis's end rather than widen the axis for it", () => {
    expect(goalPlacement(pts, line, 79.6)).toBe("below");
  });
  it("names a goal below the chart instead of stretching to it", () => {
    expect(goalPlacement(pts, line, 70)).toBe("below");
  });
  it("names a goal above the chart instead of stretching to it", () => {
    expect(goalPlacement(pts, line, 95)).toBe("above");
  });
  it("has nothing to place without a goal or without weigh-ins", () => {
    expect(goalPlacement(pts, line, null)).toBeNull();
    expect(goalPlacement([], [], 80)).toBeNull();
  });
});

describe("deriveWeightSummary: the 7-day average and the rate", () => {
  it("averages the weigh-ins of the 7 days ending today", () => {
    // 8 Aug is 7 days back: outside the window.
    const s = deriveWeightSummary([e("2026-08-08", 90), e("2026-08-09", 82), e("2026-08-15", 84)], TODAY);
    expect(s.average7).toBe(83);
  });

  it("has no 7-day average without a weigh-in in that window", () => {
    expect(deriveWeightSummary([e("2026-08-08", 90)], TODAY).average7).toBeNull();
  });

  it("fits Insights' rate over the weigh-ins", () => {
    // 14 daily weigh-ins falling 0.1 kg a day: 0.7 kg a week.
    const entries = Array.from({ length: 14 }, (_, i) => e(shiftISO(TODAY, -i), 80 + i * 0.1));
    const s = deriveWeightSummary(entries, TODAY);
    expect(s.fit.status === "fit" && s.fit.ratePerWeek).toBeCloseTo(-0.7, 6);
  });

  it("has no rate with fewer than 14 weigh-ins in 56 days", () => {
    expect(deriveWeightSummary([e(TODAY, 80)], TODAY).fit).toEqual({ status: "not-enough-data", have: 1, need: 14 });
  });

  it("draws the line as the rolling 7-day average, oldest first", () => {
    const s = deriveWeightSummary([e("2026-08-15", 84), e("2026-08-14", 82)], TODAY);
    expect(s.line).toEqual([
      { date: "2026-08-14", kg: 82, gapBefore: false },
      { date: "2026-08-15", kg: 83, gapBefore: false },
    ]);
  });

  it("is empty with no weigh-ins", () => {
    const s = deriveWeightSummary([], TODAY);
    expect(s.average7).toBeNull();
    expect(s.line).toEqual([]);
    expect(s.fit).toEqual({ status: "not-enough-data", have: 0, need: 14 });
  });
});

describe("rangeStart", () => {
  const r = (id: RangeId) => RANGES.find((x) => x.id === id)!;
  it("reaches back the range's days from today", () => {
    expect(rangeStart(r("1M"), "2026-10-14", "2025-01-01")).toBe("2026-09-14");
    expect(rangeStart(r("3M"), "2026-10-14", "2025-01-01")).toBe("2026-07-15");
  });
  it("starts All at the first weigh-in", () => {
    expect(rangeStart(r("All"), "2026-10-14", "2025-01-01")).toBe("2025-01-01");
  });
  it("lists weeks for 1M and 3M, and months beyond", () => {
    expect(RANGES.map((x) => x.period)).toEqual(["week", "week", "month", "month", "month"]);
  });
});
