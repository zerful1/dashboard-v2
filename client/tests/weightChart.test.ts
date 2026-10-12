import { describe, it, expect } from "vitest";
import { sparklineRows, weightDomain, weightRows, weightTicks } from "../src/features/weight/WeightChart";

describe("sparklineRows", () => {
  it("puts a null between two averages more than 7 days apart, so the line breaks", () => {
    const rows = sparklineRows([
      { date: "2026-10-01", kg: 80, gapBefore: false },
      { date: "2026-10-09", kg: 81, gapBefore: true },
    ]);
    expect(rows.map((r) => r.kg)).toEqual([80, null, 81]);
  });
});

const pt = (date: string, kg: number) => ({ date, kg });
const av = (date: string, kg: number, gapBefore = false) => ({ date, kg, gapBefore });

describe("weightRows", () => {
  it("puts each weigh-in in range on a day axis from the range's start", () => {
    // 1 Sep is before the range. 1 Oct follows a gap, but nothing plotted is before it, so no break.
    const rows = weightRows(
      [pt("2026-09-01", 84), pt("2026-10-01", 82), pt("2026-10-03", 81)],
      [av("2026-09-01", 84), av("2026-10-01", 82, true), av("2026-10-03", 81.5)],
      "2026-10-01",
    );
    expect(rows).toEqual([
      { x: 0, date: "2026-10-01", kg: 82, avg: 82 },
      { x: 2, date: "2026-10-03", kg: 81, avg: 81.5 },
    ]);
  });

  it("breaks the line between two plotted weigh-ins more than 7 days apart", () => {
    const rows = weightRows([pt("2026-10-01", 82), pt("2026-10-10", 81)], [av("2026-10-01", 82), av("2026-10-10", 81, true)], "2026-09-30");
    expect(rows.map((r) => r.avg)).toEqual([82, null, 81]);
  });
});

describe("weightTicks", () => {
  it("ticks every 7 days back from today for one month", () => {
    expect(weightTicks("2026-09-14", "2026-10-14", true)).toEqual([
      { x: 2, label: "16 Sep" },
      { x: 9, label: "23 Sep" },
      { x: 16, label: "30 Sep" },
      { x: 23, label: "7 Oct" },
      { x: 30, label: "14 Oct" },
    ]);
  });
  it("ticks the 1st of each month otherwise, January with its year", () => {
    expect(weightTicks("2025-11-15", "2026-02-10", false)).toEqual([
      { x: 16, label: "Dec" },
      { x: 47, label: "Jan 2026" },
      { x: 78, label: "Feb" },
    ]);
  });
  it("ticks a range that starts on the 1st at its start", () => {
    expect(weightTicks("2026-09-01", "2026-10-14", false)[0]).toEqual({ x: 0, label: "Sep" });
  });
});

describe("weightDomain", () => {
  it("has whole-number ends a kilogram beyond the data", () => {
    expect(weightDomain([81.6, 84.2])).toEqual([80, 86]);
  });
});
