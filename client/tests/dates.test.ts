import { describe, it, expect } from "vitest";
import { monthLabel, monthRangeLabel, monthTick, rangeLabel, spokenDate, weekdayInitial } from "../src/lib/dates";

describe("rangeLabel", () => {
  it("names a span inside one month", () => {
    expect(rangeLabel("2026-09-24", "2026-09-30", "2026-10-07")).toBe("24–30 Sep");
  });
  it("names both months across a month boundary", () => {
    expect(rangeLabel("2026-09-28", "2026-10-04", "2026-10-07")).toBe("28 Sep – 4 Oct");
  });
  it("adds the year that isn't today's across a year boundary", () => {
    expect(rangeLabel("2025-12-29", "2026-01-04", "2026-10-07")).toBe("29 Dec 2025 – 4 Jan");
  });
  it("adds the year to a span wholly in another year", () => {
    expect(rangeLabel("2025-03-01", "2025-03-07", "2026-10-07")).toBe("1–7 Mar 2025");
  });
});

describe("spokenDate and weekdayInitial", () => {
  it("reads a date in full, in English, whatever the locale", () => {
    expect(spokenDate("2026-10-06")).toBe("Tuesday 6 October");
  });
  it("gives the weekday's initial", () => {
    expect(["2026-10-05", "2026-10-06", "2026-10-11"].map(weekdayInitial)).toEqual(["M", "T", "S"]);
  });
});

describe("monthLabel", () => {
  it("names a month of this year in full, and another year's short with its year", () => {
    expect(monthLabel("2026-10-01", "2026-10-14")).toBe("October");
    expect(monthLabel("2025-09-01", "2026-10-14")).toBe("Sep 2025");
  });
});

describe("monthRangeLabel", () => {
  it("names a run of months, with years when either is outside today's", () => {
    expect(monthRangeLabel("2026-02-01", "2026-04-30", "2026-10-14")).toBe("Feb – Apr");
    expect(monthRangeLabel("2025-11-01", "2026-02-28", "2026-10-14")).toBe("Nov 2025 – Feb 2026");
  });
  it("names a single month the way monthLabel does", () => {
    expect(monthRangeLabel("2026-10-01", "2026-10-31", "2026-10-14")).toBe("October");
  });
});

describe("monthTick", () => {
  it("is the short month, with January carrying its year", () => {
    expect(monthTick("2026-10-01")).toBe("Oct");
    expect(monthTick("2026-01-01")).toBe("Jan 2026");
  });
});
