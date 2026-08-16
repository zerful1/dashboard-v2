import { describe, it, expect } from "vitest";
import { deriveWeightSummary } from "../src/features/weight/deriveWeight";
import type { BodyWeightEntry } from "@dashboard/shared";

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
  it("returns empty state for no entries", () => {
    const s = deriveWeightSummary([], TODAY);
    expect(s.latest).toBeNull();
    expect(s.points).toEqual([]);
    expect(s.trend).toEqual([]);
  });

  it("takes the latest by date, not by array position", () => {
    const s = deriveWeightSummary([e("2026-08-10", 83), e("2026-08-15", 82)], TODAY);
    expect(s.latest).toBe(82);
    expect(s.latestDate).toBe("2026-08-15");
  });

  it("compares against the most recent entry on or before the cutoff", () => {
    // Nothing exactly 7 days ago; 2026-08-06 is the nearest before it. An exact
    // date match would return null here and report no change.
    const s = deriveWeightSummary([e("2026-08-06", 84), e("2026-08-15", 82)], TODAY);
    expect(s.deltaWeek).toBe(-2);
  });

  it("returns null for a delta with no entry old enough", () => {
    const s = deriveWeightSummary([e("2026-08-14", 82), e("2026-08-15", 82.2)], TODAY);
    expect(s.deltaMonth).toBeNull();
  });

  it("rounds deltas to one decimal", () => {
    // The older entry must be on or before the 30-day cutoff (2026-07-16) or
    // there is no delta to round — 82.11 - 83.33 = -1.22, which rounds to -1.2.
    const s = deriveWeightSummary([e("2026-07-10", 83.33), e("2026-08-15", 82.11)], TODAY);
    expect(s.deltaMonth).toBe(-1.2);
  });

  it("finds the lowest across the whole history, not the recent window", () => {
    const s = deriveWeightSummary(
      [e("2025-09-26", 79.5), e("2026-08-14", 82), e("2026-08-15", 82.2)],
      TODAY,
    );
    expect(s.lowest).toBe(79.5);
  });

  it("emits exactly two trend endpoints spanning the data", () => {
    const s = deriveWeightSummary(
      [e("2026-08-01", 84), e("2026-08-08", 83), e("2026-08-15", 82)],
      TODAY,
    );
    expect(s.trend).toHaveLength(2);
    expect(s.trend[0]!.date).toBe("2026-08-01");
    expect(s.trend[1]!.date).toBe("2026-08-15");
    // Downward history must produce a downward line. This is the assertion that
    // would have caught trendPoint's arguments being passed in the wrong order.
    expect(s.trend[1]!.kg).toBeLessThan(s.trend[0]!.kg);
  });

  it("fits the trend through the data, not beside it", () => {
    // Perfectly linear input: the fitted endpoints must equal the real ones.
    const s = deriveWeightSummary(
      [e("2026-08-01", 84), e("2026-08-02", 83), e("2026-08-03", 82)],
      TODAY,
    );
    expect(s.trend[0]!.kg).toBeCloseTo(84, 5);
    expect(s.trend[1]!.kg).toBeCloseTo(82, 5);
  });

  it("emits no trend for a single point", () => {
    expect(deriveWeightSummary([e("2026-08-15", 82)], TODAY).trend).toEqual([]);
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
    expect(s.deltaWeek).toBe(null);
  });
});
