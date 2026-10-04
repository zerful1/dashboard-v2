import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEntrySheet } from "../src/features/nutrition/EditEntrySheet";
import type { FoodLogEntry } from "@dashboard/shared";

const oats: FoodLogEntry = {
  id: "e1", user_id: "u", date: "2026-09-23", logged_at: "", food_item_id: null, name: "Oats",
  quantity: 80, unit: "g", calories: 304, protein_g: 10.4, fat_g: 5.6, carbs_g: 52,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null,
};
const fake = () => ({ mutate: vi.fn(), isPending: false });

describe("EditEntrySheet", () => {
  it("previews the new amount and saves it", async () => {
    const rescale = fake();
    render(<EditEntrySheet entry={oats} onClose={() => {}} rescale={rescale as never} remove={fake() as never} />);
    await userEvent.clear(screen.getByLabelText("Amount (g)"));
    await userEvent.type(screen.getByLabelText("Amount (g)"), "40");
    expect(screen.getByText(/152 kcal/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(rescale.mutate).toHaveBeenCalledWith({ id: "e1", quantity: 40 });
  });

  it("will not save an empty amount", async () => {
    render(<EditEntrySheet entry={oats} onClose={() => {}} rescale={fake() as never} remove={fake() as never} />);
    await userEvent.clear(screen.getByLabelText("Amount (g)"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes", async () => {
    const remove = fake();
    render(<EditEntrySheet entry={oats} onClose={() => {}} rescale={fake() as never} remove={remove as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove.mutate).toHaveBeenCalledWith("e1");
  });

  // #17 review (8): a second tap during the exit animation deleted again, and
  // the server answered "Entry not found".
  it("deletes once, however many times Delete is tapped", async () => {
    const remove = fake();
    render(<EditEntrySheet entry={oats} onClose={() => {}} rescale={fake() as never} remove={remove as never} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove.mutate).toHaveBeenCalledTimes(1);
  });
});
