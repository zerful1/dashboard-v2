import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { shiftISO, type AveragePoint, type TrendFit } from "@dashboard/shared";
import { WeightSection } from "../src/features/home/WeightSection";
import type { WeightSummary } from "../src/features/weight/deriveWeight";

// Recharts draws nothing in jsdom: capture what the sparkline is handed instead.
const sparkline = vi.hoisted(() => ({ line: null as unknown }));
vi.mock("@/features/weight/WeightChart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/features/weight/WeightChart")>()),
  WeightSparkline: ({ line }: { line: unknown }) => {
    sparkline.line = line;
    return null;
  },
}));

const fit = (ratePerWeek: number): TrendFit => ({ status: "fit", ratePerWeek, current: 82, slope: ratePerWeek / 7 });
const summary = (over: Partial<WeightSummary>): WeightSummary => ({
  latest: 82, latestDate: "2026-10-06", average7: 82.2, fit: fit(-0.4), points: [], line: [], ...over,
});
function show(over: Partial<WeightSummary>, goalKg: number | null = 78) {
  return render(
    <MemoryRouter>
      <WeightSection weight={{ summary: summary(over), goalKg, isError: false }} />
    </MemoryRouter>,
  );
}

describe("Home's weight section (redesign part 5, §6)", () => {
  it("shows Weight's rate under the latest weigh-in, green toward the goal", () => {
    show({});
    const rate = screen.getByText("−0.4 kg a week");
    expect(rate.closest("[data-tone]")).toHaveAttribute("data-tone", "good");
    expect(rate.closest("[data-tone]")).toHaveClass("text-good");
    expect(screen.getByText("82.0")).toBeInTheDocument();
  });

  it("leaves the rate muted without a goal, and never amber or red", () => {
    const { container } = show({}, null);
    expect(container.querySelector(".text-good, .text-caution, .text-negative")).toBeNull();
  });

  it("says Flat under 0.05 kg a week", () => {
    show({ fit: fit(-0.02) });
    expect(screen.getByText("Flat")).toBeInTheDocument();
  });

  it("says when there are too few weigh-ins for a rate", () => {
    show({ fit: { status: "not-enough-data", have: 3, need: 14 } });
    expect(screen.getByText("Not enough weigh-ins for a rate")).toBeInTheDocument();
  });

  it("no longer counts the last 7 days", () => {
    show({});
    expect(screen.queryByText(/in 7 days/)).toBeNull();
  });

  it("draws the sparkline from the last 30 points of the 7-day average", () => {
    const line: AveragePoint[] = Array.from({ length: 40 }, (_, i) => ({
      date: shiftISO("2026-09-01", i), kg: 80 + i / 10, gapBefore: false,
    }));
    show({ line });
    expect(sparkline.line).toEqual(line.slice(-30));
  });
});
