import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmountStep } from "../src/features/nutrition/AmountStep";
import { hitToChoice, entryToChoice } from "@dashboard/shared";
import type { FoodHit, FoodLogEntry } from "@dashboard/shared";

const per100g = { kcal: 380, p: 13, f: 7, c: 65 };
const oats: FoodHit = { source: "cofid", externalId: "1", name: "Oats", servings: [{ label: "100 g", grams: 100, ...per100g }], per100g };

describe("AmountStep", () => {
  it("defaults to 100 g, previews, and logs to the date it was given", async () => {
    const onAdd = vi.fn();
    render(<AmountStep choice={hitToChoice(oats)} date="2026-09-20" onAdd={onAdd} onBack={() => {}} />);
    expect(screen.getByText(/380 kcal/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Amount (g)"));
    await userEvent.type(screen.getByLabelText("Amount (g)"), "80");
    expect(screen.getByText(/304 kcal/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    // Review focus 5: the chosen day, not today.
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-20", quantity: 80, calories: 304 }));
  });

  // Review focus 3: iPhone keypads in some regions type a decimal comma.
  it("accepts a decimal comma and refuses an empty or non-numeric amount", async () => {
    const onAdd = vi.fn();
    render(<AmountStep choice={hitToChoice(oats)} date="2026-09-20" onAdd={onAdd} onBack={() => {}} />);
    const box = screen.getByLabelText("Amount (g)");
    const add = screen.getByRole("button", { name: "Add" });

    await userEvent.clear(box);
    expect(add).toBeDisabled();
    await userEvent.type(box, "abc");
    expect(add).toBeDisabled();

    await userEvent.clear(box);
    await userEvent.type(box, "1,5");
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1.5 }));
    expect(Number.isNaN(onAdd.mock.calls[0]![0].calories)).toBe(false);
  });

  it("offers no grams for a food known only by the serving", () => {
    const entry = {
      id: "e", user_id: "u", date: "2026-06-10", logged_at: "", food_item_id: null, name: "Wrap",
      quantity: 1, unit: "serving", calories: 610, protein_g: 38, fat_g: 20, carbs_g: 64,
      fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null,
    } satisfies FoodLogEntry;
    render(<AmountStep choice={entryToChoice(entry)} date="2026-09-20" onAdd={() => {}} onBack={() => {}} />);
    expect(screen.getByRole("button", { name: "g" })).toBeDisabled();
    expect(screen.getByLabelText("Servings")).toHaveValue("1");
  });

  it("starts from the amount last logged", () => {
    render(
      <AmountStep choice={hitToChoice(oats)} date="2026-09-20" initial={{ quantity: 50, unit: "g" }} onAdd={() => {}} onBack={() => {}} />,
    );
    expect(screen.getByLabelText("Amount (g)")).toHaveValue("50");
  });

  // The sheet closes on Add, but its exit animation keeps this step mounted and
  // clickable for a moment: a double tap would log the food twice.
  it("adds once, however many times Add is tapped", async () => {
    const onAdd = vi.fn();
    render(<AmountStep choice={hitToChoice(oats)} date="2026-09-20" onAdd={onAdd} onBack={() => {}} />);
    const add = screen.getByRole("button", { name: "Add" });
    await userEvent.click(add);
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
