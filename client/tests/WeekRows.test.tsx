import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReviewDay, WeekNumbers, WeeklyReview } from "@dashboard/shared";
import { WeekRows } from "../src/features/insights/WeekRows";
import { foodBar, weightPoints } from "../src/features/insights/WeekStrips";

const MON = "2026-09-21";
const day = (i: number, over: Partial<ReviewDay> = {}): ReviewDay => ({
  date: `2026-09-${21 + i}`, trained: false, kcal: null, weightKg: null, ...over,
});
const numbers = (over: Partial<WeekNumbers> = {}): WeekNumbers => ({
  training: { days: 4, sets: 38, volume: 9120 },
  food: { daysLogged: 3, avgKcal: 2310, avgProteinG: 168 },
  weight: { average: 78.6, weighIns: 4 },
  ...over,
});
const review = (over: Partial<WeeklyReview> = {}): WeeklyReview => ({
  week: MON, current: numbers(), trainingTarget: 5, foodTarget: { calories: 2402, proteinG: 180 },
  previous: numbers({ training: { days: 3, sets: 30, volume: 8600 }, weight: { average: 77.8, weighIns: 3 } }),
  days: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, { trained: [0, 1, 3, 4].includes(i), kcal: i < 3 ? 2310 : null, weightKg: i % 2 ? 78.6 : null })),
  ...over,
});

describe("WeekRows", () => {
  it("reads training as days of the target, with sets, volume and its change", () => {
    render(<WeekRows review={review()} goalKg={null} />);
    expect(screen.getByText("of 5 days")).toBeInTheDocument();
    expect(screen.getByText("38 sets · 9,120 kg (+6%)")).toBeInTheDocument();
    expect(screen.getByText("Trained Monday, Tuesday, Thursday and Friday")).toBeInTheDocument();
  });

  it("reads food as the average against the target, with protein and the days logged", () => {
    render(<WeekRows review={review()} goalKg={null} />);
    expect(screen.getByText("2,310")).toBeInTheDocument();
    expect(screen.getByText("of 2,402 · 168 of 180 g protein · 3 days logged")).toBeInTheDocument();
  });

  it("turns the food figure amber when the average is over the target, and only then", () => {
    const { rerender } = render(<WeekRows review={review()} goalKg={null} />);
    expect(screen.getByText("2,310")).not.toHaveClass("text-caution");
    rerender(<WeekRows review={review({ current: numbers({ food: { daysLogged: 3, avgKcal: 2500, avgProteinG: 168 } }) })} goalKg={null} />);
    expect(screen.getByText("2,500")).toHaveClass("text-caution");
  });

  // Final review: with no target, "No day over target" is a false statement.
  it("tells a screen reader nothing about targets when there is none", () => {
    const { rerender } = render(<WeekRows review={review()} goalKg={null} />);
    expect(screen.getByText("No day over target")).toBeInTheDocument();
    rerender(<WeekRows review={review({ foodTarget: null })} goalKg={null} />);
    expect(screen.queryByText("No day over target")).toBeNull();
  });

  it("says no food was logged instead of showing zero", () => {
    render(<WeekRows review={review({ current: numbers({ food: { daysLogged: 0, avgKcal: null, avgProteinG: null } }) })} goalKg={null} />);
    expect(screen.getByText("No food logged")).toBeInTheDocument();
    expect(screen.queryByText(/0 kcal/)).toBeNull();
  });

  it("colours the weight change green toward the goal, and white away from it", () => {
    const { rerender } = render(<WeekRows review={review()} goalKg={80} />);
    expect(screen.getByText("+0.8").closest("[data-tone]")).toHaveAttribute("data-tone", "good");
    rerender(<WeekRows review={review()} goalKg={75} />);
    expect(screen.getByText("+0.8").closest("[data-tone]")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByText(/4 weigh-ins/)).toBeInTheDocument();
  });

  // Found in the browser pass: 80.52 against 80.49 read "▲ 0.0", and could go green.
  it("shows no arrow and no colour for a change that rounds to 0.0", () => {
    const flat = review({ previous: numbers({ weight: { average: 78.58, weighIns: 3 } }) });
    render(<WeekRows review={flat} goalKg={80} />);
    const change = screen.getByText("0.0").closest("[data-tone]");
    expect(change).toHaveAttribute("data-tone", "neutral");
    expect(change).not.toHaveTextContent(/[▲▼]/);
  });

  it("says there were no weigh-ins", () => {
    render(<WeekRows review={review({ current: numbers({ weight: { average: null, weighIns: 0 } }) })} goalKg={null} />);
    expect(screen.getByText("No weigh-ins")).toBeInTheDocument();
  });

  it("marks the days trained and rings the others", () => {
    const { container } = render(<WeekRows review={review()} goalKg={null} />);
    expect(container.querySelectorAll('[data-part="mark"].bg-accent')).toHaveLength(4);
    expect(container.querySelectorAll('[data-part="mark"].border-dim')).toHaveLength(3);
  });
});

describe("foodBar", () => {
  it("is white up to the target and striped past it", () => {
    expect(foodBar(2000, 2400, 3000)).toEqual({ fill: (2000 / 3000) * 100, over: 0 });
    expect(foodBar(2700, 2400, 3000)).toEqual({ fill: 80, over: 10 });
  });
  it("draws nothing for a day with nothing logged", () => {
    expect(foodBar(null, 2400, 3000)).toBeNull();
  });
  // Review focus 4.
  it("scales to the largest day without a target, with nothing over", () => {
    expect(foodBar(1500, null, 3000)).toEqual({ fill: 50, over: 0 });
  });
});

describe("weightPoints", () => {
  it("places each weigh-in at its day, never on a scale tighter than 1 kg", () => {
    const pts = weightPoints([0, 1, 2, 3, 4, 5, 6].map((i) => day(i, { weightKg: i === 0 ? 80 : i === 6 ? 79.8 : null })));
    expect(pts.map((p) => p.x)).toEqual([5, 65]);
    // 0.2 kg apart on a 1 kg scale: a small step, not the full height.
    expect(Math.abs(pts[1]!.y - pts[0]!.y)).toBeLessThan(6);
  });
  // Review focus 3.
  it("places a single weigh-in in the middle", () => {
    const pts = weightPoints([0, 1, 2, 3, 4, 5, 6].map((i) => day(i, { weightKg: i === 3 ? 80 : null })));
    expect(pts).toEqual([{ x: 35, y: 14 }]);
  });
  it("is empty with no weigh-ins", () => {
    expect(weightPoints([0, 1, 2, 3, 4, 5, 6].map((i) => day(i)))).toEqual([]);
  });
});
