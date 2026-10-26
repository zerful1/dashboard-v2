import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { rollingAverage } from "@dashboard/shared";

// jsdom lays nothing out, so ResponsiveContainer measures 0 × 0 and draws no
// axis. A fixed size stands in for the phone's.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
    cloneElement(children, { width: 360, height: 224 }),
}));

import { LiftChart, WeightChart } from "../src/features/weight/WeightChart";

/** The Y axis's labels, bottom to top, as the chart draws them. */
const yLabels = (c: HTMLElement) =>
  [...c.querySelectorAll('text[orientation="left"]')].map((t) => Number(t.textContent));

function lift(values: number[]) {
  const points = values.map((value, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, value, isBest: false }));
  return yLabels(render(<LiftChart unit="kg" points={points} />).container);
}

function weight(kgs: number[]) {
  const points = kgs.map((kg, i) => ({ date: `2026-10-${String(i + 10).padStart(2, "0")}`, kg }));
  const { container } = render(
    <WeightChart points={points} line={rollingAverage(points)} start="2026-10-01" today="2026-10-31"
      goalKg={null} span="1 month" weekly />,
  );
  return yLabels(container);
}

const ends = (labels: number[]) => [labels[0], labels[labels.length - 1]];

// The axis ends at the whole numbers just outside the data. It used to pad a
// kilogram or two beyond that, and a 2 kg change filled a third of the height.
describe("chart Y axes end at the data", () => {
  it("weight: 81.6 to 84.2 kg runs 81 to 85", () => {
    expect(ends(weight([84.2, 83.9, 83.5, 83.1, 82.8, 82.4, 82.0, 81.6]))).toEqual([81, 85]);
  });

  it("lift: 100 to 107.5 kg runs 100 to 108", () => {
    expect(ends(lift([100, 102.5, 105, 107.5]))).toEqual([100, 108]);
  });

  it("lift: a wide range, 88.67 to 128.7, runs 88 to 129 with both ends labelled", () => {
    expect(ends(lift([88.67, 128.7]))).toEqual([88, 129]);
  });

  it("lift: whole-number data ends exactly on it", () => {
    expect(ends(lift([60, 61, 62]))).toEqual([60, 62]);
  });

  it("lift: a flat line still gets an axis a unit either side", () => {
    expect(ends(lift([100, 100]))).toEqual([99, 101]);
  });

  it("labels every tick inside the ends, as whole numbers", () => {
    const labels = lift([88.67, 128.7]);
    expect(labels.every((v) => Number.isInteger(v) && v >= 88 && v <= 129)).toBe(true);
  });
});
