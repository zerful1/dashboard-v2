import { describe, it, expect, vi } from "vitest";
import { cloneElement, type ReactElement } from "react";
import { render } from "@testing-library/react";
import type { AveragePoint } from "@dashboard/shared";
import { WeightSparkline } from "../src/features/weight/WeightChart";

// jsdom has no layout, so a ResponsiveContainer measures 0 x 0 and draws
// nothing. A fixed size lets the line and its dots render.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 300, height: 32 }),
  };
});

const av = (date: string, kg: number, gapBefore = false): AveragePoint => ({ date, kg, gapBefore });

describe("WeightSparkline", () => {
  it("draws a lone point after a gap as a dot, where a line has nothing to join", () => {
    const { container } = render(
      <WeightSparkline line={[av("2026-09-01", 80), av("2026-09-02", 80.4), av("2026-09-20", 81, true)]} />,
    );
    expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("draws an unbroken line with no dots", () => {
    const { container } = render(
      <WeightSparkline line={[av("2026-09-01", 80), av("2026-09-02", 80.4), av("2026-09-03", 80.1)]} />,
    );
    expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});
