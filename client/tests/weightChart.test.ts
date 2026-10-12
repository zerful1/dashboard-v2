import { describe, it, expect } from "vitest";
import { sparklineRows } from "../src/features/weight/WeightChart";

describe("sparklineRows", () => {
  it("puts a null between two averages more than 7 days apart, so the line breaks", () => {
    const rows = sparklineRows([
      { date: "2026-10-01", kg: 80, gapBefore: false },
      { date: "2026-10-09", kg: 81, gapBefore: true },
    ]);
    expect(rows.map((r) => r.kg)).toEqual([80, null, 81]);
  });
});
