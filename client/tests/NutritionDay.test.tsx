import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryCard } from "../src/features/nutrition/SummaryCard";
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

describe("SummaryCard", () => {
  it("shows kcal left against the target", () => {
    render(<SummaryCard summary={deriveDay([entry({ calories: 1640 })], [cut], "2026-09-23")} onSetTargets={() => {}} />);
    expect(screen.getByText("762 left")).toBeInTheDocument();
  });

  it("turns an over-target macro gold, and never protein", () => {
    const summary = deriveDay([entry({ protein_g: 200, carbs_g: 230 })], [cut], "2026-09-23");
    render(<SummaryCard summary={summary} onSetTargets={() => {}} />);
    expect(screen.getByRole("progressbar", { name: "Carbs" }).firstElementChild).toHaveClass("bg-gold");
    expect(screen.getByRole("progressbar", { name: "Protein" }).firstElementChild).not.toHaveClass("bg-gold");
  });

  it("offers to set targets when there are none", async () => {
    const onSetTargets = vi.fn();
    render(<SummaryCard summary={deriveDay([entry({})], [], "2026-09-23")} onSetTargets={onSetTargets} />);
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
  // Review focus 2: the migrated June days know no label nutrients at all.
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
