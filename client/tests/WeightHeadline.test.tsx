import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { shiftISO, type BodyWeightEntry, type Goal } from "@dashboard/shared";
import { WeightHeadline } from "../src/features/weight/WeightHeadline";
import { deriveWeightSummary } from "../src/features/weight/deriveWeight";

const TODAY = "2026-10-14"; // a Wednesday
const e = (date: string, kg: number): BodyWeightEntry => ({ id: date, user_id: "u1", date, weight_kg: kg, notes: null, created_at: "" });
/** n daily weigh-ins ending today, on an exact line at `perWeek` that ends at `endKg`. */
const daily = (n: number, endKg: number, perWeek: number) =>
  Array.from({ length: n }, (_, i) => e(shiftISO(TODAY, -i), endKg - (perWeek * i) / 7));
const goal = (target_kg: number, start_kg: number | null = 84): Goal => ({
  id: "g", user_id: "u1", kind: "weight", exercise_name: null, target_kg, start_kg, created_at: "",
});

function show(entries: BodyWeightEntry[], opts: { goal?: Goal | null; goalsFailed?: boolean } = {}) {
  return render(
    <WeightHeadline summary={deriveWeightSummary(entries, TODAY)} today={TODAY} goal={opts.goal ?? null} goalsFailed={opts.goalsFailed ?? false} />,
  );
}

describe("WeightHeadline", () => {
  it("shows the 7-day average as the figure", () => {
    // The last 7 days run from 80.43 down to 80: their mean is 80.21.
    show(daily(14, 80, -0.5));
    expect(screen.getByText("7-day average")).toBeInTheDocument();
    expect(screen.getByText("80.2")).toBeInTheDocument();
  });

  it("words the rate, green toward the goal", () => {
    show(daily(14, 80, -0.5), { goal: goal(78) });
    const rate = screen.getByText("−0.5 kg a week").closest("[data-tone]");
    expect(rate).toHaveAttribute("data-tone", "good");
    expect(rate).toHaveClass("text-good");
  });

  it("turns the rate white once the goal is reached, beside the goal line saying so", () => {
    const { container } = show(daily(14, 77.9, -0.5), { goal: goal(78) });
    expect(screen.getByText("Goal 78 kg · reached")).toBeInTheDocument();
    expect(screen.getByText("−0.5 kg a week")).toBeInTheDocument();
    expect(container.querySelector(".text-good")).toBeNull();
  });

  it("leaves the rate white without a goal", () => {
    const { container } = show(daily(14, 80, -0.5));
    expect(container.querySelector(".text-good, .text-caution, .text-negative")).toBeNull();
  });

  it("says Flat under 0.05 kg a week", () => {
    show(daily(14, 80, 0));
    expect(screen.getByText("Flat")).toBeInTheDocument();
  });

  it("says how many weigh-ins a rate still needs", () => {
    show(daily(5, 80, -0.5));
    expect(screen.getByText("Not enough weigh-ins for a rate (5 of 14)")).toBeInTheDocument();
  });

  it("names the latest weigh-in", () => {
    show(daily(14, 80, -0.5));
    expect(screen.getByText(/latest 80\.0 today/)).toBeInTheDocument();
  });

  it("shows — and says so when nothing was weighed in the last 7 days", () => {
    show([e("2026-10-04", 82)]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No weigh-in in 7 days")).toBeInTheDocument();
    expect(screen.getByText(/latest 82\.0 on 4 Oct/)).toBeInTheDocument();
  });

  it("says when there are no weigh-ins at all", () => {
    show([]);
    expect(screen.getByText("No weigh-ins yet")).toBeInTheDocument();
  });

  it("writes the goal line from Insights' projection", () => {
    show(daily(14, 80, -0.5), { goal: goal(79) });
    expect(screen.getByText("Goal 79 kg · around 26 Oct")).toBeInTheDocument();
  });

  it("says the goal could not be loaded", () => {
    show(daily(14, 80, -0.5), { goalsFailed: true });
    expect(screen.getByText("Couldn't load your goal")).toBeInTheDocument();
  });

  it("shows no goal line without a goal", () => {
    show(daily(14, 80, -0.5));
    expect(screen.queryByText(/^Goal /)).toBeNull();
  });
});
