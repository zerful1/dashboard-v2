import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { weekStrip, type DayTotal, type NutritionTarget } from "@dashboard/shared";
import { WeekStrip, shortKcal } from "../src/features/nutrition/WeekStrip";

const cut: NutritionTarget = {
  id: "t", user_id: "u", effective_from: "2026-06-09", goal_mode: "cut",
  calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210, created_at: "",
};
const WED = "2026-10-07";
const TOTALS: DayTotal[] = [
  { date: "2026-10-02", calories: 2520, protein_g: 150 },
  { date: "2026-10-05", calories: 2380, protein_g: 181 },
  { date: "2026-10-06", calories: 2979, protein_g: 131 },
  { date: WED, calories: 1874, protein_g: 112 },
];

type Props = Parameters<typeof WeekStrip>[0];
function renderStrip(over: Partial<Props> = {}) {
  const props: Props = {
    end: WED, today: WED, open: WED, strip: weekStrip(TOTALS, [cut], WED, WED),
    failed: false, todayUnknown: false, onOpen: vi.fn(), onPrev: vi.fn(), onNext: vi.fn(), ...over,
  };
  render(<WeekStrip {...props} />);
  return props;
}
const bar = (name: RegExp) => screen.getByRole("button", { name });
const summary = () => screen.getByText(/^Last 7 days$|–/).parentElement!;

describe("WeekStrip", () => {
  it("shows the seven days ending today, with the open day pressed", () => {
    renderStrip();
    const days = within(screen.getByRole("group", { name: "Last 7 days" })).getAllByRole("button");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAccessibleName("Thursday 1 October: nothing logged");
    expect(bar(/^Wednesday 7 October/)).toHaveAttribute("aria-pressed", "true");
    expect(bar(/^Tuesday 6 October/)).toHaveAttribute("aria-pressed", "false");
  });

  it("labels each day in full", () => {
    renderStrip();
    expect(bar(/^Tuesday 6 October/)).toHaveAccessibleName(
      "Tuesday 6 October: 2,979 kcal, 577 over target, protein 131 of 180 g",
    );
    expect(bar(/^Monday 5 October/)).toHaveAccessibleName("Monday 5 October: 2,380 kcal, protein 181 of 180 g");
  });

  it("draws an over day white to the target, then stripes, with an amber number", () => {
    renderStrip();
    const tue = bar(/^Tuesday 6 October/);
    expect(tue.querySelector('[data-part="fill"]')).toHaveClass("bg-accent");
    expect(tue.querySelector('[data-part="over"]')).toHaveClass("bar-over");
    expect(within(tue).getByText("3.0k")).toHaveClass("text-caution");
    // The positive complement: an under day has no stripes, and a plain number.
    const mon = bar(/^Monday 5 October/);
    expect(mon.querySelector('[data-part="over"]')).toBeNull();
    expect(within(mon).getByText("2.4k")).not.toHaveClass("text-caution");
  });

  it("reads a day with nothing logged as —, with no bar and no dot", () => {
    renderStrip();
    const thu = bar(/^Thursday 1 October/);
    expect(within(thu).getByText("—")).toBeInTheDocument();
    expect(thu.querySelector('[data-part="fill"]')).toBeNull();
    expect(thu.querySelector('[data-part="protein"]')).toBeNull();
  });

  it("fills the protein dot only on days protein reached its target", () => {
    renderStrip();
    expect(bar(/^Monday 5 October/).querySelector('[data-part="protein"]')).toHaveClass("bg-accent");
    expect(bar(/^Tuesday 6 October/).querySelector('[data-part="protein"]')).not.toHaveClass("bg-accent");
  });

  it("sums up the days over and the average of the complete ones", () => {
    renderStrip();
    // Over: Fri 2,520 and Tue 2,979. Average: Fri, Mon, Tue; today left out.
    expect(summary()).toHaveTextContent("Last 7 days · 2 over · avg 2,626");
  });

  it("with no targets, draws no line, no dots and no over", () => {
    renderStrip({ strip: weekStrip(TOTALS, [], WED, WED) });
    expect(document.querySelector('[data-part="target"]')).toBeNull();
    expect(document.querySelector('[data-part="protein"]')).toBeNull();
    expect(document.querySelector('[data-part="over"]')).toBeNull();
    expect(summary()).toHaveTextContent("Last 7 days · avg 2,626");
  });

  it("names a past week by its range, and says none over", () => {
    renderStrip({ end: "2026-09-30", open: "2026-09-30", strip: weekStrip([], [cut], "2026-09-30", WED) });
    expect(screen.getByRole("group", { name: "24–30 Sep" })).toBeInTheDocument();
    expect(summary()).toHaveTextContent("24–30 Sep · none over");
  });

  it("claims nothing while loading", () => {
    renderStrip({ strip: null });
    expect(bar(/^Wednesday 7 October/)).toHaveAccessibleName("Wednesday 7 October");
    expect(screen.queryByText("—")).toBeNull();
    expect(document.querySelector('[data-part="fill"]')).toBeNull();
    expect(summary()).toHaveTextContent(/^Last 7 days$/);
  });

  it("says when the week fails, and still moves by week", async () => {
    const props = renderStrip({ strip: null, failed: true });
    expect(screen.getByText("Couldn't load the week.")).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(props.onPrev).toHaveBeenCalled();
  });

  // Offline on a new day, today comes from yesterday's answer.
  it("leaves today unknown, not empty, when it comes from yesterday's answer", () => {
    renderStrip({ strip: weekStrip(TOTALS.slice(0, 3), [cut], WED, WED), todayUnknown: true });
    const wed = bar(/^Wednesday 7 October/);
    expect(wed).toHaveAccessibleName("Wednesday 7 October");
    expect(within(wed).queryByText("—")).toBeNull();
  });

  it("opens a day on tap, and moves by week, never past today", async () => {
    const props = renderStrip();
    await userEvent.click(bar(/^Tuesday 6 October/));
    expect(props.onOpen).toHaveBeenCalledWith("2026-10-06");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(props.onPrev).toHaveBeenCalled();
  });

  it("lets a past week move forward", async () => {
    const props = renderStrip({ end: "2026-09-30", open: "2026-09-30", strip: weekStrip([], [cut], "2026-09-30", WED) });
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(props.onNext).toHaveBeenCalled();
  });
});

describe("shortKcal", () => {
  it("is whole below 1,000 and one decimal of thousands from it", () => {
    expect([999, 1000, 2979].map(shortKcal)).toEqual(["999", "1.0k", "3.0k"]);
  });
});
