import { describe, it, expect } from "vitest";
import { dayMonth, lastFullWeek, percentChange, signed, weekLabel } from "../src/features/insights/format";

describe("insights formatting", () => {
  // Review focus 1: a week across a month end names both months.
  it("labels a week, naming both months when it spans two", () => {
    expect(weekLabel("2026-09-21")).toBe("21–27 Sep");
    expect(weekLabel("2026-09-28")).toBe("28 Sep – 4 Oct");
    expect(weekLabel("2026-12-28")).toBe("28 Dec – 3 Jan");
  });

  it("finds the last full week from any day of this one", () => {
    expect(lastFullWeek("2026-10-03")).toBe("2026-09-21"); // a Saturday
    expect(lastFullWeek("2026-09-28")).toBe("2026-09-21"); // a Monday
  });

  it("signs changes with a real minus, and leaves zero unsigned", () => {
    expect(signed(0.8, 1)).toBe("+0.8");
    expect(signed(-0.44, 1)).toBe("−0.4");
    expect(signed(0, 1)).toBe("0.0");
  });

  it("gives a percent change only when there is something to compare with", () => {
    expect(percentChange(106, 100)).toBe("+6%");
    expect(percentChange(90, 100)).toBe("−10%");
    expect(percentChange(50, 0)).toBeNull();
  });

  it("reads a date as day and month", () => {
    expect(dayMonth("2026-11-09")).toBe("9 Nov");
  });
});
