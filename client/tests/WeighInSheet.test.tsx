import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BodyWeightEntry } from "@dashboard/shared";
import { WeighInSheet, type WeighInTarget } from "../src/features/weight/WeighInSheet";

const TODAY = "2026-08-17";
const entry = (date: string, kg: number, over: Partial<BodyWeightEntry> = {}): BodyWeightEntry => ({
  id: date, user_id: "u1", date, weight_kg: kg, notes: null, created_at: "", ...over,
});

function renderSheet(target: WeighInTarget, entries: BodyWeightEntry[] = []) {
  const save = vi.fn();
  const remove = vi.fn();
  const onClose = vi.fn();
  const props = {
    target, onClose, today: TODAY,
    save: { mutate: save, isPending: false } as never,
    remove: { mutate: remove, isPending: false } as never,
  };
  const view = render(<WeighInSheet {...props} entries={entries} />);
  return { save, remove, onClose, rerender: (next: BodyWeightEntry[]) => view.rerender(<WeighInSheet {...props} entries={next} />) };
}

/**
 * Set the date the way the native picker does: one whole value. Not
 * userEvent.clear + type: clear() fires "" and DateSelector ignores it.
 */
function pickDate(value: string) {
  fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value } });
}
const kg = () => screen.getByLabelText("Weight (kg)");
const LOG: WeighInTarget = { mode: "log" };

describe("WeighInSheet, opened by Log", () => {
  it("defaults to today and saves against it", async () => {
    const { save, onClose } = renderSheet(LOG);
    expect(screen.getByRole("dialog", { name: "Log weight" })).toBeInTheDocument();
    await userEvent.type(kg(), "82.4");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(save).toHaveBeenCalledWith({ date: TODAY, weight_kg: 82.4, notes: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("suggests the latest weigh-in as the placeholder, by date", () => {
    // Out of order on purpose: the newest by date is 79.6, whatever the array's order.
    renderSheet(LOG, [entry("2026-08-15", 79.6), entry("2026-08-10", 80.1), entry("2026-08-12", 80.0)].reverse());
    expect(kg()).toHaveValue(null);
    expect(kg()).toHaveAttribute("placeholder", "79.6");
  });

  it("falls back to 82.4 as the placeholder with no weigh-ins", () => {
    renderSheet(LOG);
    expect(kg()).toHaveAttribute("placeholder", "82.4");
  });

  it("saves on Enter", async () => {
    const { save } = renderSheet(LOG);
    await userEvent.type(kg(), "82.4{Enter}");
    expect(save).toHaveBeenCalledWith({ date: TODAY, weight_kg: 82.4, notes: null });
  });

  it("saves against a chosen past date", async () => {
    const { save } = renderSheet(LOG);
    pickDate("2026-08-10");
    await userEvent.type(kg(), "83.1");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(save).toHaveBeenCalledWith({ date: "2026-08-10", weight_kg: 83.1, notes: null });
  });

  it("fills in a date that already has a weigh-in, says Update, and offers Delete", () => {
    renderSheet(LOG, [entry(TODAY, 82.4, { notes: "after a run" })]);
    expect(kg()).toHaveValue(82.4);
    expect(screen.getByLabelText("Notes")).toHaveValue("after a run");
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("reloads the fields when the date changes", async () => {
    renderSheet(LOG, [entry(TODAY, 82.4), entry("2026-08-10", 83.1)]);
    pickDate("2026-08-10");
    await waitFor(() => expect(kg()).toHaveValue(83.1));
    pickDate("2026-08-01");
    await waitFor(() => expect(kg()).toHaveValue(null));
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("keeps what is being typed when the weigh-ins refetch", async () => {
    const { rerender } = renderSheet(LOG, [entry(TODAY, 82.4)]);
    await userEvent.clear(kg());
    await userEvent.type(kg(), "81.9");
    rerender([entry(TODAY, 82.5)]);
    expect(kg()).toHaveValue(81.9);
  });

  it("refuses a weight it cannot save", async () => {
    const { save } = renderSheet(LOG);
    expect(screen.getByRole("button", { name: "Log" })).toBeDisabled();
    await userEvent.type(kg(), "0");
    expect(screen.getByRole("button", { name: "Log" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  // Review focus 4: the minute after midnight, the clock says the 18th while
  // the page's useToday still says the 17th (CLAUDE.md, one clock per page).
  it("cannot pick a date after the page's today, even once the clock has moved on", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 18, 0, 0, 30));
    try {
      renderSheet(LOG);
      expect((document.querySelector('input[type="date"]') as HTMLInputElement).max).toBe(TODAY);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the date when the picker is emptied", async () => {
    const { save } = renderSheet(LOG);
    pickDate("2026-08-10");
    pickDate("");
    await userEvent.type(kg(), "83.1");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(save).toHaveBeenCalledWith({ date: "2026-08-10", weight_kg: 83.1, notes: null });
  });
});

describe("WeighInSheet, opened from a weigh-in", () => {
  const E = entry("2026-08-10", 83.1, { notes: "late" });

  it("fixes the date, the save key, and saves the edit", async () => {
    const { save } = renderSheet({ mode: "edit", entry: E }, [E]);
    expect(screen.getByRole("dialog", { name: /^Edit / })).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    await userEvent.clear(kg());
    await userEvent.type(kg(), "82.9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith({ date: "2026-08-10", weight_kg: 82.9, notes: "late" });
  });

  it("deletes it", async () => {
    const { remove, onClose } = renderSheet({ mode: "edit", entry: E }, [E]);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("2026-08-10");
    expect(onClose).toHaveBeenCalled();
  });

  // Review focus 2: the server has never issued an optimistic id.
  it("cannot delete a weigh-in still saving", () => {
    const saving = entry("2026-08-10", 83.1, { id: "optimistic-2026-08-10" });
    renderSheet({ mode: "edit", entry: saving }, [saving]);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
