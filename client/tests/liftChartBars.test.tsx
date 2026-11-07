import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import type { LiftChartPoint } from "@dashboard/shared";

// jsdom lays nothing out, so ResponsiveContainer measures 0 × 0 and draws
// nothing. A fixed size stands in for the phone's.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
    cloneElement(children, { width: 360, height: 224 }),
}));

import { LiftChart } from "../src/features/weight/WeightChart";

const TODAY = "2026-11-07";
const day = (date: string, weight_kg: number, reps: number, isBest = false, is_bodyweight = false): LiftChartPoint => ({
  date,
  value: is_bodyweight ? reps : weight_kg,
  isBest,
  set: { date, weight_kg, reps, reps_left: null, reps_right: null, is_bodyweight },
});

const bars = (c: HTMLElement) => [...c.querySelectorAll(".recharts-bar-rectangle path")];
const barFills = (c: HTMLElement) => bars(c).map((p) => p.getAttribute("fill"));

// The user's ask: a rep gain at one weight must not look like a plateau.
describe("LiftChart's rep bars and readout", () => {
  const points = [day("2026-10-01", 60, 8, true), day("2026-10-08", 60, 9, true), day("2026-10-15", 60, 10, true)];

  it("names the latest day's exact set before anything is tapped", () => {
    render(<LiftChart unit="kg" points={points} today={TODAY} />);
    expect(screen.getByText("15 Oct · 60 × 10 · new high")).toBeInTheDocument();
  });

  it("draws a bar per day, the shown day's white and the rest muted", () => {
    const { container } = render(<LiftChart unit="kg" points={points} today={TODAY} />);
    expect(barFills(container)).toEqual(["var(--color-muted)", "var(--color-muted)", "var(--color-accent)"]);
    // The positive complement: the weight line is there too.
    expect(container.querySelector(".recharts-line")).not.toBeNull();
  });

  // From zero, so 10 reps stands 1.25 × as tall as 8, not a full strip against a sliver.
  it("draws bars in proportion to the reps", () => {
    const { container } = render(<LiftChart unit="kg" points={points} today={TODAY} />);
    const h = bars(container).map((b) => Number(b.getAttribute("height")));
    expect(h[1]! / h[0]!).toBeCloseTo(9 / 8, 2);
    expect(h[2]! / h[0]!).toBeCloseTo(10 / 8, 2);
  });

  // Why it is one chart: each bar sits under its own day's point, and the line
  // stays clear of the bars.
  it("puts each bar under its day's point, below the line", () => {
    const climbing = [day("2026-10-01", 60, 8), day("2026-10-08", 60, 12), day("2026-10-15", 62.5, 6)];
    const { container } = render(<LiftChart unit="kg" points={climbing} today={TODAY} />);
    const dots = [...container.querySelectorAll(".recharts-line-dots circle")];
    bars(container).forEach((b, i) => {
      const centre = Number(b.getAttribute("x")) + Number(b.getAttribute("width")) / 2;
      expect(Math.abs(centre - Number(dots[i]!.getAttribute("cx")))).toBeLessThan(1);
    });
    const lowestDot = Math.max(...dots.map((d) => Number(d.getAttribute("cy"))));
    const tallestBar = Math.min(...bars(container).map((b) => Number(b.getAttribute("y"))));
    expect(lowestDot).toBeLessThan(tallestBar);
  });

  // jsdom puts the chart at the page's left edge, so clientX is the x inside it.
  // The plot runs from x = 32 (the axis) across 320 px: three columns of ~107.
  it("picks the day a tap lands on, and names its set", () => {
    const { container } = render(<LiftChart unit="kg" points={points} today={TODAY} />);
    fireEvent.click(screen.getByRole("img"), { clientX: 40 });
    expect(screen.getByText("1 Oct · 60 × 8 · new high")).toBeInTheDocument();
    expect(barFills(container)).toEqual(["var(--color-accent)", "var(--color-muted)", "var(--color-muted)"]);
    fireEvent.click(screen.getByRole("img"), { clientX: 200 });
    expect(screen.getByText("8 Oct · 60 × 9 · new high")).toBeInTheDocument();
  });

  const counts = (c: HTMLElement) => [...c.querySelectorAll<SVGTextElement>("text.lift-rep-count")];

  it("prints each day's reps over its bar, the picked day's in white", () => {
    const { container } = render(<LiftChart unit="kg" points={points} today={TODAY} />);
    expect(counts(container).map((t) => t.textContent)).toEqual(["8", "9", "10"]);
    expect(counts(container).map((t) => t.getAttribute("fill"))).toEqual([
      "var(--color-muted)",
      "var(--color-muted)",
      "var(--color-text)",
    ]);
    // Each sits over its own bar.
    bars(container).forEach((b, i) => {
      const centre = Number(b.getAttribute("x")) + Number(b.getAttribute("width")) / 2;
      expect(Math.abs(Number(counts(container)[i]!.getAttribute("x")) - centre)).toBeLessThan(1);
      expect(Number(counts(container)[i]!.getAttribute("y"))).toBeLessThan(Number(b.getAttribute("y")));
    });
  });

  // 40 days in 320 px is 8 px a column: the counts would run together.
  it("keeps only the picked day's count when the chart is crowded", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      day(`2026-0${8 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, 60, 8 + (i % 3)),
    );
    const { container } = render(<LiftChart unit="kg" points={many} today={TODAY} />);
    expect(counts(container).map((t) => t.textContent)).toEqual([String(8 + (39 % 3))]);
  });

  // The counts stand in the gap between the bars and the line. The tight case:
  // the lightest day has the most reps, so its dot sits lowest over the tallest bar.
  it("keeps the line clear of the counts", () => {
    const tight = [day("2026-10-01", 60, 12), day("2026-10-08", 62.5, 8), day("2026-10-15", 65, 6)];
    const { container } = render(<LiftChart unit="kg" points={tight} today={TODAY} />);
    const lowestDot = Math.max(...[...container.querySelectorAll(".recharts-line-dots circle")].map((d) => Number(d.getAttribute("cy")) + Number(d.getAttribute("r"))));
    // y is the text's baseline; at the 10 px tick size its top is ~8 px above.
    const highestCountTop = Math.min(...counts(container).map((t) => Number(t.getAttribute("y")) - 8));
    expect(lowestDot).toBeLessThan(highestCountTop);
  });

  // With no line above them, the tallest bars once reached the top and their
  // counts were cut off: in the browser, Pull Ups' two 9s were missing.
  it("leaves room over a bodyweight lift's tallest bar for its count", () => {
    const bw = [day("2026-10-01", 0, 5, false, true), day("2026-10-08", 0, 9, false, true), day("2026-10-15", 0, 8, false, true)];
    const { container } = render(<LiftChart unit="reps" points={bw} today={TODAY} />);
    expect(counts(container).map((t) => t.textContent)).toEqual(["5", "9", "8"]);
    // The plot's top is the chart's 4 px margin; a count's top is ~8 px over its baseline.
    for (const t of counts(container)) expect(Number(t.getAttribute("y")) - 8).toBeGreaterThanOrEqual(4);
    // The headroom is not labelled: the axis tops out at the most reps done,
    // not at an uneven "11" that nobody did.
    const ticks = [...container.querySelectorAll('text[orientation="left"]')].map((t) => t.textContent);
    expect(ticks).toEqual(["0", "5", "9"]);
  });

  it("draws a bodyweight-only lift as bars alone", () => {
    const bw = [day("2026-10-01", 0, 10, true, true), day("2026-10-08", 0, 12, true, true)];
    const { container } = render(<LiftChart unit="reps" points={bw} today={TODAY} />);
    expect(container.querySelector(".recharts-line")).toBeNull();
    expect(barFills(container)).toHaveLength(2);
    expect(screen.getByText("8 Oct · BW × 12 · new high")).toBeInTheDocument();
  });
});
