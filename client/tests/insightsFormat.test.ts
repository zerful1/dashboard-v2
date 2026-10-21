import { describe, it, expect } from "vitest";
import { dayMonth, lastFullWeek, percentChange, signed, weekLabel } from "../src/features/insights/format";

const TODAY = "2026-10-03";

describe("insights formatting", () => {
  // A week across a month end names both months.
  it("labels a week, naming both months when it spans two", () => {
    expect(weekLabel("2026-09-21", TODAY)).toBe("21–27 Sep");
    expect(weekLabel("2026-09-28", TODAY)).toBe("28 Sep – 4 Oct");
    expect(weekLabel("2026-12-28", "2027-01-10")).toBe("28 Dec – 3 Jan");
  });

  // Records reach back to 2025, so a date from another year
  // must say so, or a 2025 record reads as this year's.
  it("adds the year to a date or week outside the current year", () => {
    expect(weekLabel("2025-09-22", TODAY)).toBe("22–28 Sep 2025");
    expect(weekLabel("2026-12-28", TODAY)).toBe("28 Dec – 3 Jan 2027");
    expect(dayMonth("2025-09-30", TODAY)).toBe("30 Sep 2025");
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
    // No change when either week is 0. A bodyweight-only week
    // has 0 kg of volume, and "−100%" would read as a collapse.
    expect(percentChange(0, 100)).toBeNull();
  });

  it("reads a date in the current year as day and month", () => {
    expect(dayMonth("2026-11-09", TODAY)).toBe("9 Nov");
  });
});
