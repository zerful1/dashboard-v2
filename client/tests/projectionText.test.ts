import { describe, it, expect } from "vitest";
import { projectionText } from "../src/features/insights/projectionText";

const TODAY = "2026-10-03";

describe("projectionText", () => {
  it("reads every status as a sentence", () => {
    expect(projectionText({ goalId: "g", status: "projected", date: "2026-11-09", ratePerWeek: -0.44, current: 78 }, "weight", TODAY))
      .toBe("around 9 Nov · −0.4 kg a week");
    expect(projectionText({ goalId: "g", status: "reached", current: 75 }, "weight", TODAY)).toBe("Reached");
    expect(projectionText({ goalId: "g", status: "not-enough-data", have: 4, need: 6 }, "lift", TODAY))
      .toBe("Not enough data yet (4 of 6 sessions)");
    expect(projectionText({ goalId: "g", status: "not-enough-data", have: 9, need: 14 }, "weight", TODAY))
      .toBe("Not enough data yet (9 of 14 weigh-ins)");
    expect(projectionText({ goalId: "g", status: "away", ratePerWeek: 0.3, current: 79 }, "weight", TODAY))
      .toBe("Trending away from this goal (+0.3 kg a week)");
    expect(projectionText({ goalId: "g", status: "flat", ratePerWeek: 0.01, current: 79 }, "weight", TODAY)).toBe("Flat at this rate");
    expect(projectionText({ goalId: "g", status: "over-a-year", ratePerWeek: -0.06, current: 79 }, "weight", TODAY))
      .toBe("Over a year away at this rate");
  });

  // Dates round down to their Monday, so a projection later
  // this week once came out as a past date ("around 28 Sep" on Saturday 3 Oct).
  it("says this week for a projection that falls in the current week", () => {
    expect(projectionText({ goalId: "g", status: "projected", date: "2026-09-28", ratePerWeek: -0.5, current: 78.1 }, "weight", TODAY))
      .toBe("this week · −0.5 kg a week");
    expect(projectionText({ goalId: "g", status: "projected", date: "2026-10-05", ratePerWeek: -0.5, current: 78.4 }, "weight", TODAY))
      .toBe("around 5 Oct · −0.5 kg a week");
  });

  // A date in another year says so.
  it("names the year of a projected date next year", () => {
    expect(projectionText({ goalId: "g", status: "projected", date: "2027-01-11", ratePerWeek: 0.5, current: 70 }, "lift", TODAY))
      .toBe("around 11 Jan 2027 · +0.5 kg a week");
  });
});
