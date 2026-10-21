import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayFigure } from "../src/features/nutrition/DayFigure";
import { DiaryList, timeOf } from "../src/features/nutrition/DiaryList";
import { LabelStrip } from "../src/features/nutrition/LabelStrip";
import { deriveDay } from "../src/features/nutrition/deriveDay";
import type { FoodLogEntry, NutritionTarget } from "@dashboard/shared";

const cut: NutritionTarget = {
  id: "t", user_id: "u", effective_from: "2026-06-09", goal_mode: "cut",
  calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210, created_at: "",
};
const entry = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  id: "e1", user_id: "u", date: "2026-09-23", logged_at: "2026-09-23T07:10:00.000Z", food_item_id: null,
  name: "Oats", quantity: 60, unit: "g", calories: 225, protein_g: 7, fat_g: 4, carbs_g: 36,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, ...over,
});

/** The figure and its unit, e.g. "762 kcal left". */
const figure = () => screen.getByText(/^kcal (left|over|eaten)$/).parentElement!;

describe("DayFigure", () => {
  it("shows kcal left against the target, and what was eaten", () => {
    render(<DayFigure summary={deriveDay([entry({ calories: 1640 })], [cut], "2026-09-23")} onSetTargets={() => {}} />);
    expect(figure()).toHaveTextContent("762 kcal left");
    expect(figure()).not.toHaveClass("text-caution");
    expect(screen.getByText("1,640 of 2,402 eaten")).toBeInTheDocument();
  });

  it("turns amber past the target", () => {
    render(<DayFigure summary={deriveDay([entry({ calories: 2522 })], [cut], "2026-09-23")} onSetTargets={() => {}} />);
    expect(figure()).toHaveTextContent("120 kcal over");
    expect(figure()).toHaveClass("text-caution");
  });

  // Over target, the part past the goal is amber stripes after a notch;
  // protein is never "over".
  it("draws the excess past a macro's target as stripes, and never for protein", () => {
    const summary = deriveDay([entry({ protein_g: 200, carbs_g: 230 })], [cut], "2026-09-23");
    render(<DayFigure summary={summary} onSetTargets={() => {}} />);
    expect(screen.getByRole("progressbar", { name: "Carbs" }).querySelector('[data-part="over"]')).toHaveClass("bar-over");
    expect(screen.getByRole("progressbar", { name: "Protein" }).querySelector('[data-part="over"]')).toBeNull();
  });

  // The positive complement: under target there is a fill and no stripes.
  it("draws an under-target macro as a plain white fill", () => {
    const summary = deriveDay([entry({ protein_g: 20, carbs_g: 20 })], [cut], "2026-09-23");
    render(<DayFigure summary={summary} onSetTargets={() => {}} />);
    const carbs = screen.getByRole("progressbar", { name: "Carbs" });
    expect(carbs.querySelector('[data-part="fill"]')).toHaveClass("bg-accent");
    expect(carbs.querySelector('[data-part="over"]')).toBeNull();
  });

  it("shows kcal eaten, and offers to set targets, when there are none", async () => {
    const onSetTargets = vi.fn();
    render(<DayFigure summary={deriveDay([entry({})], [], "2026-09-23")} onSetTargets={onSetTargets} />);
    expect(figure()).toHaveTextContent("225 kcal eaten");
    await userEvent.click(screen.getByRole("button", { name: "Set targets" }));
    expect(onSetTargets).toHaveBeenCalled();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });
});

describe("DiaryList", () => {
  it("shows time, name, amount and kcal", () => {
    render(<DiaryList entries={[entry({})]} onSelect={() => {}} />);
    expect(screen.getByText(timeOf("2026-09-23T07:10:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("Oats")).toBeInTheDocument();
    expect(screen.getByText("· 60 g")).toBeInTheDocument();
    expect(screen.getByText("225")).toBeInTheDocument();
  });

  it("does not let an unsaved entry be opened", () => {
    render(<DiaryList entries={[entry({ id: "optimistic-1" })]} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Oats/ })).toBeDisabled();
  });

  it("says so when nothing is logged", () => {
    render(<DiaryList entries={[]} onSelect={() => {}} />);
    expect(screen.getByText("Nothing logged")).toBeInTheDocument();
  });
});

describe("LabelStrip", () => {
  // The migrated June days know no label nutrients at all.
  it("shows a dash, not zero, when nothing is known", () => {
    render(<LabelStrip labels={deriveDay([entry({}), entry({ id: "e2" })], [], "2026-09-23").labels} />);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0 g")).not.toBeInTheDocument();
  });

  it("marks a total partial when some foods lack it", () => {
    const labels = deriveDay([entry({ fibre_g: 6 }), entry({ id: "e2" })], [], "2026-09-23").labels;
    render(<LabelStrip labels={labels} />);
    expect(screen.getByText("6 g")).toBeInTheDocument();
    expect(screen.getByText("(partial)")).toBeInTheDocument();
  });
});
