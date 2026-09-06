import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogWeightCard } from "../src/features/weight/LogWeightCard";
import type { BodyWeightEntry } from "@dashboard/shared";

const TODAY = "2026-08-17";

const entry = (date: string, kg: number): BodyWeightEntry => ({
  id: date,
  user_id: "u1",
  date,
  weight_kg: kg,
  notes: null,
  created_at: "",
});

function renderCard(entries: BodyWeightEntry[] = []) {
  const mutate = vi.fn();
  render(<LogWeightCard save={{ mutate, isPending: false } as never} entries={entries} />);
  return { mutate };
}

/**
 * Set the date the way the real control does.
 *
 * NOT userEvent.clear + type. A native date picker commits one whole value;
 * nobody types into this input character by character. clear() fires a change
 * with "", which DateSelector's `if (e.target.value)` guard deliberately
 * ignores — so the controlled input snaps straight back and onChange is never
 * called at all.
 */
function pickDate(value: string) {
  const input = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function freezeToday() {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Local noon, so the local calendar day is unambiguous whatever the runner's
  // timezone — the point of the date-as-string discipline.
  vi.setSystemTime(new Date(2026, 7, 17, 12));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LogWeightCard", () => {
  it("defaults to today and saves against it", async () => {
    freezeToday();
    const { mutate } = renderCard();

    await userEvent.type(screen.getByLabelText(/weight/i), "82.4");
    await userEvent.click(screen.getByRole("button", { name: /^log$/i }));

    expect(mutate).toHaveBeenCalledWith({ date: TODAY, weight_kg: 82.4 });
  });

  it("saves against a chosen past date", async () => {
    freezeToday();
    const { mutate } = renderCard();

    pickDate("2026-08-10");

    await userEvent.type(screen.getByLabelText(/weight/i), "83.1");
    await userEvent.click(screen.getByRole("button", { name: /^log$/i }));

    expect(mutate).toHaveBeenCalledWith({ date: "2026-08-10", weight_kg: 83.1 });
  });

  it("prefills and says Update when the chosen date already has an entry", async () => {
    freezeToday();
    renderCard([entry(TODAY, 82.4)]);

    expect(screen.getByLabelText(/weight/i)).toHaveValue(82.4);
    expect(screen.getByRole("button", { name: /^update$/i })).toBeInTheDocument();
  });

  it("reloads the input when the date changes", async () => {
    freezeToday();
    renderCard([entry(TODAY, 82.4), entry("2026-08-10", 83.1)]);

    expect(screen.getByLabelText(/weight/i)).toHaveValue(82.4);

    pickDate("2026-08-10");

    // The bug this guards: useState's initialiser runs once, so without the
    // effect the input would still read 82.4.
    await waitFor(() => expect(screen.getByLabelText(/weight/i)).toHaveValue(83.1));
  });

  it("clears the input for a date with no entry", async () => {
    freezeToday();
    renderCard([entry(TODAY, 82.4)]);

    pickDate("2026-08-01");

    await waitFor(() => expect(screen.getByLabelText(/weight/i)).toHaveValue(null));
    expect(screen.getByRole("button", { name: /^log$/i })).toBeInTheDocument();
  });

  it("names the target date when it is not today", async () => {
    freezeToday();
    renderCard();

    pickDate("2026-08-10");

    expect(await screen.findByText(/saving to 2026-08-10/i)).toBeInTheDocument();
  });

  it("shows no target hint when the date is today", () => {
    freezeToday();
    renderCard();
    expect(screen.queryByText(/saving to/i)).toBeNull();
  });

  it("refuses to save an invalid weight", async () => {
    freezeToday();
    const { mutate } = renderCard();

    expect(screen.getByRole("button", { name: /^log$/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/weight/i), "0");
    expect(screen.getByRole("button", { name: /^log$/i })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("cannot be set to a future date", () => {
    freezeToday();
    renderCard();
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    // A weigh-in you have not taken yet is a typo, not a plan.
    expect(input.max).toBe(TODAY);
  });

  it("keeps the date when the picker is emptied", async () => {
    // Not in the plan. Found while fixing these tests: DateSelector's
    // `if (e.target.value)` guard is what makes an emptied picker a no-op, and
    // nothing covered it. Without the guard this saves `date: ""`.
    freezeToday();
    const { mutate } = renderCard();

    pickDate("2026-08-10");
    pickDate("");

    await userEvent.type(screen.getByLabelText(/weight/i), "83.1");
    await userEvent.click(screen.getByRole("button", { name: /^log$/i }));

    expect(mutate).toHaveBeenCalledWith({ date: "2026-08-10", weight_kg: 83.1 });
  });
});
