import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BodyWeightEntry, PeriodRow } from "@dashboard/shared";
import { PeriodList } from "../src/features/weight/PeriodList";

const TODAY = "2026-10-14"; // a Wednesday
type Period = Extract<PeriodRow, { kind: "period" }>;
const week = (over: Partial<Period> = {}): PeriodRow => ({
  kind: "period", start: "2026-10-05", end: "2026-10-11", current: false, average: 82.3, change: -0.1, weighIns: 6,
  days: ["missed", "weighed", "weighed", "weighed", "weighed", "weighed", "weighed"], ...over,
});
const entry = (date: string, kg: number): BodyWeightEntry => ({ id: date, user_id: "u1", date, weight_kg: kg, notes: null, created_at: "" });

function renderList(rows: PeriodRow[], over: Partial<Parameters<typeof PeriodList>[0]> = {}) {
  const onToggle = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <PeriodList rows={rows} kind="week" entries={[]} goalKg={78} today={TODAY} open={null} onToggle={onToggle} onSelect={onSelect} {...over} />,
  );
  return { onToggle, onSelect, container: view.container };
}

describe("PeriodList", () => {
  it("shows a week's dates, average and change, green toward the goal", () => {
    renderList([week()]);
    expect(screen.getByText("Weeks")).toBeInTheDocument();
    expect(screen.getByText("5–11 Oct")).toBeInTheDocument();
    expect(screen.getByText("82.3")).toBeInTheDocument();
    const change = screen.getByText("−0.1").closest("[data-tone]");
    expect(change).toHaveAttribute("data-tone", "good");
    expect(change).toHaveClass("text-good");
  });

  it("leaves a change away from the goal white", () => {
    const { container } = renderList([week({ change: 0.2 })]);
    expect(screen.getByText("+0.2").closest("[data-tone]")).toHaveAttribute("data-tone", "neutral");
    expect(container.querySelector(".text-good")).toBeNull();
  });

  it("reads 'so far' for the current week, and — before its first weigh-in", () => {
    renderList([week({ current: true, start: "2026-10-12", end: "2026-10-18", average: null, change: null, weighIns: 0,
      days: ["missed", "missed", "missed", "future", "future", "future", "future"] })]);
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("so far")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marks the days weighed, rings the days missed, and leaves the future blank", () => {
    const { container } = renderList([week({ current: true, start: "2026-10-12", end: "2026-10-18", change: null,
      days: ["weighed", "weighed", "missed", "future", "future", "future", "future"] })]);
    const marks = container.querySelectorAll('[data-part="mark"]');
    expect(marks).toHaveLength(3);
    expect(container.querySelectorAll('[data-part="mark"].bg-accent')).toHaveLength(2);
    expect(container.querySelectorAll('[data-part="mark"].border-dim')).toHaveLength(1);
  });

  it("leaves the days before the first weigh-in blank, not ringed as missed", () => {
    const { container } = renderList([week({ weighIns: 1, days: ["before", "before", "weighed", "missed", "missed", "missed", "missed"] })]);
    expect(container.querySelectorAll('[data-part="mark"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-part="mark"].border-dim')).toHaveLength(4);
  });

  it("says 1 weigh-in, singular, to a screen reader, and more in the plural", () => {
    renderList([week({ weighIns: 1 }), week({ start: "2026-09-28", end: "2026-10-04" })]);
    expect(screen.getByRole("button", { name: /^5–11 Oct/ }).getAttribute("aria-label")).toMatch(/, 1 weigh-in$/);
    expect(screen.getByRole("button", { name: /^28 Sep/ }).getAttribute("aria-label")).toMatch(/, 6 weigh-ins$/);
  });

  it("shows — when the week before had no weigh-ins", () => {
    renderList([week({ change: null })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("lists months by name, with a count instead of day marks", () => {
    const { container } = renderList(
      [{ kind: "period", start: "2026-09-01", end: "2026-09-30", current: false, average: 82.5, change: -0.4, weighIns: 24, days: null }],
      { kind: "month" },
    );
    expect(screen.getByText("Months")).toBeInTheDocument();
    expect(screen.getByText("September")).toBeInTheDocument();
    expect(screen.getByText("24 weigh-ins")).toBeInTheDocument();
    expect(container.querySelector('[data-part="mark"]')).toBeNull();
  });

  it("folds a run of empty weeks into one line that is not a button", () => {
    renderList([{ kind: "empty", start: "2026-09-14", end: "2026-09-27" }]);
    expect(screen.getByText("14–27 Sep · no weigh-ins")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toggles a row", async () => {
    const { onToggle } = renderList([week()]);
    await userEvent.click(screen.getByRole("button", { name: /^5–11 Oct/ }));
    expect(onToggle).toHaveBeenCalledWith("2026-10-05");
  });

  it("opens a row onto its own weigh-ins, newest first, each opening the sheet", async () => {
    const inside = entry("2026-10-07", 82.2);
    const { onSelect } = renderList([week()], {
      open: "2026-10-05",
      entries: [inside, entry("2026-10-05", 82.4), entry("2026-10-01", 83)],
    });
    expect(screen.getByRole("button", { name: /^5–11 Oct/ })).toHaveAttribute("aria-expanded", "true");
    const newer = screen.getByText("82.2 kg");
    const older = screen.getByText("82.4 kg");
    expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("83.0 kg")).toBeNull();
    await userEvent.click(newer);
    expect(onSelect).toHaveBeenCalledWith(inside);
  });
});
