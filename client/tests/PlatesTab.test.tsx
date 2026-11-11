import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatesTab } from "../src/features/gym/PlatesTab";

const type = async (label: string, value: string) => {
  const el = screen.getByLabelText(label);
  await userEvent.clear(el);
  await userEvent.type(el, value);
};
const plateChip = (kg: string) => screen.getByRole("button", { name: `${kg} kg plate` });

beforeEach(() => localStorage.clear());

describe("Plates tab, just me", () => {
  it("shows each side and the plates for a total over the machine", async () => {
    render(<PlatesTab />);
    await type("Machine starts at", "20");
    await type("Total weight", "75");
    expect(screen.getByText("27.5 kg")).toBeInTheDocument();
    expect(screen.getByText("55 kg of plates")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Each side: 25 kg and 2.5 kg" })).toBeInTheDocument();
  });

  it("nudges a weight by the step with + and -, from empty as 0, never below 0", async () => {
    render(<PlatesTab />);
    const start = screen.getByLabelText("Machine starts at");
    await userEvent.click(screen.getByRole("button", { name: "More Machine starts at" }));
    expect(start).toHaveValue("2.5");
    await userEvent.click(screen.getByRole("button", { name: "More Machine starts at" }));
    expect(start).toHaveValue("5");
    await userEvent.click(screen.getByRole("button", { name: "Less Machine starts at" }));
    await userEvent.click(screen.getByRole("button", { name: "Less Machine starts at" }));
    await userEvent.click(screen.getByRole("button", { name: "Less Machine starts at" }));
    expect(start).toHaveValue("0");
  });

  it("steps from a decimal without float dust", async () => {
    render(<PlatesTab />);
    await type("Total weight", "77,5");
    await userEvent.click(screen.getByRole("button", { name: "More Total weight" }));
    expect(screen.getByLabelText("Total weight")).toHaveValue("80");
    await userEvent.click(screen.getByRole("button", { name: "Less Total weight" }));
    await userEvent.click(screen.getByRole("button", { name: "Less Total weight" }));
    expect(screen.getByLabelText("Total weight")).toHaveValue("75");
  });

  it("loads only the plates switched on, says when it is off, and the step follows the smallest", async () => {
    render(<PlatesTab />);
    expect(plateChip("1.25")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(plateChip("25"));
    await userEvent.click(plateChip("1.25"));
    expect(plateChip("25")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "More Machine starts at" }));
    expect(screen.getByLabelText("Machine starts at")).toHaveValue("5");
    await type("Machine starts at", "20");
    await type("Total weight", "76");
    expect(screen.getByText("Closest you can load: 75 kg, 1 kg under")).toHaveClass("text-caution");
    expect(screen.getByRole("img", { name: "Each side: 20 kg, 5 kg and 2.5 kg" })).toBeInTheDocument();
  });

  it("says over when the closest load is heavier than typed", async () => {
    render(<PlatesTab />);
    await userEvent.click(plateChip("25"));
    await userEvent.click(plateChip("20"));
    await userEvent.click(plateChip("15"));
    await userEvent.click(plateChip("10"));
    await userEvent.click(plateChip("2.5"));
    await userEvent.click(plateChip("1.25"));
    // only 5s are left: a side of 4.5 is nearest as 5
    await type("Machine starts at", "20");
    await type("Total weight", "29");
    expect(screen.getByText("Closest you can load: 30 kg, 1 kg over")).toBeInTheDocument();
  });

  it("will not switch off the last plate", async () => {
    render(<PlatesTab />);
    for (const p of ["25", "20", "15", "10", "5", "2.5"]) await userEvent.click(plateChip(p));
    await userEvent.click(plateChip("1.25"));
    expect(plateChip("1.25")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the plates as chips under the figure", async () => {
    render(<PlatesTab />);
    await type("Machine starts at", "20");
    await type("Total weight", "75");
    const chips = screen.getByRole("list", { name: "Plates each side" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["25", "2.5"]);
  });

  it("says so when the total is the machine, or less than it", async () => {
    render(<PlatesTab />);
    await type("Machine starts at", "20");
    await type("Total weight", "20");
    expect(screen.getByText("Just the machine")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await type("Total weight", "15");
    expect(screen.getByText("Less than the machine on its own")).toBeInTheDocument();
    expect(screen.queryByText("Just the machine")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["empty total", "20", ""],
    ["empty start", "", "75"],
    ["not a number", "20", "abc"],
    ["negative", "20", "-5"],
    ["over 1000 kg", "20", "1001"],
  ])("gives no result and no error for %s", async (_n, start, total) => {
    render(<PlatesTab />);
    if (start) await type("Machine starts at", start);
    if (total) await type("Total weight", total);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Just the machine|Less than the machine|Closest/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still answers at exactly 1000 kg", async () => {
    render(<PlatesTab />);
    await type("Machine starts at", "0");
    await type("Total weight", "1000");
    expect(screen.getByText("500 kg")).toBeInTheDocument();
  });

  it("still owns up when the nearest load is no plates at all", async () => {
    render(<PlatesTab />);
    await type("Machine starts at", "20");
    await type("Total weight", "21");
    expect(screen.getByText("Just the machine")).toBeInTheDocument();
    expect(screen.getByText("Closest you can load: 20 kg, 1 kg under")).toBeInTheDocument();
  });
});

const toBuddy = () => userEvent.click(screen.getByRole("button", { name: "With a buddy" }));

describe("Plates tab, with a buddy", () => {
  it("switches mode and swaps the fields", async () => {
    render(<PlatesTab />);
    expect(screen.getByRole("button", { name: "Just me" })).toHaveAttribute("aria-pressed", "true");
    await toBuddy();
    expect(screen.getByRole("button", { name: "With a buddy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Just me" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("You")).toBeInTheDocument();
    expect(screen.getByLabelText("Buddy")).toBeInTheDocument();
    expect(screen.queryByLabelText("Total weight")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Machine starts at")).toBeInTheDocument();
  });

  it("keeps the lighter lifter's plates on and shows what to swap", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    await type("Buddy", "50");
    expect(screen.getByText("Buddy · solid")).toBeInTheDocument();
    expect(screen.getByText("15 kg")).toBeInTheDocument();
    expect(screen.getByText("You · solid + dashed")).toBeInTheDocument();
    expect(screen.getByText("27.5 kg")).toBeInTheDocument();
    expect(screen.getByText("Take off or add 10 · 2.5 each side")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Each side: 15 kg stays on; 10 kg and 2.5 kg come on and off" }),
    ).toBeInTheDocument();
    // one shared sleeve, the lighter lifter's figure first
    expect(screen.getAllByRole("img")).toHaveLength(1);
    const labels = screen.getAllByText(/· solid/).map((e) => e.textContent);
    expect(labels).toEqual(["Buddy · solid", "You · solid + dashed"]);
  });

  it("puts whoever is lighter on the inside", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "50");
    await type("Buddy", "75");
    expect(screen.getByText("You · solid")).toBeInTheDocument();
    expect(screen.getByText("Buddy · solid + dashed")).toBeInTheDocument();
    expect(screen.getByText("Take off or add 10 · 2.5 each side")).toBeInTheDocument();
  });

  it("says nothing needs swapping at the same weight", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    await type("Buddy", "75");
    expect(screen.getByText("Same weight, nothing to swap")).toBeInTheDocument();
    expect(screen.queryByText(/Take off or add/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Plates to swap" })).not.toBeInTheDocument();
  });

  it("owns up to a side it cannot load exactly, per person", async () => {
    render(<PlatesTab />);
    await userEvent.click(plateChip("25"));
    await userEvent.click(plateChip("1.25"));
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "76");
    await type("Buddy", "50");
    expect(screen.getByText("Closest you can load: 75 kg, 1 kg under")).toBeInTheDocument();
  });

  it("keeps both figures when one is under the machine, and offers no swap", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    await type("Buddy", "15");
    expect(screen.getByText("Less than the machine on its own")).toBeInTheDocument();
    expect(screen.getByText("27.5 kg")).toBeInTheDocument();
    // the field label and the figure label for each
    expect(screen.getAllByText("Buddy")).toHaveLength(2);
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.queryByText("To swap")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Each side: 25 kg and 2.5 kg" })).toBeInTheDocument();
  });

  it("says Just the machine, not 0 kg, for a lifter whose total is the machine", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "20");
    await type("Buddy", "15");
    expect(screen.getByText("Just the machine")).toBeInTheDocument();
    expect(screen.queryByText("0 kg")).not.toBeInTheDocument();
    expect(screen.queryByText("To swap")).not.toBeInTheDocument();
  });

  it("drops solid and dashed from the labels when nothing is dashed", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    await type("Buddy", "75");
    expect(screen.getByText("Same weight, nothing to swap")).toBeInTheDocument();
    expect(screen.queryByText(/solid/)).not.toBeInTheDocument();
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.getAllByText("Buddy")).toHaveLength(2);
  });

  it("shows a dash for a lifter whose weight is not typed yet, and no swap", async () => {
    render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("27.5 kg")).toBeInTheDocument();
    expect(screen.queryByText("To swap")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Plates tab, remembered on the device", () => {
  afterEach(() => vi.restoreAllMocks());

  it("brings back the mode, starting weight and plates, but not the totals", async () => {
    const first = render(<PlatesTab />);
    await toBuddy();
    await type("Machine starts at", "20");
    await type("You", "75");
    await type("Buddy", "50");
    await userEvent.click(plateChip("25"));
    first.unmount();

    render(<PlatesTab />);
    expect(screen.getByRole("button", { name: "With a buddy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Machine starts at")).toHaveValue("20");
    expect(plateChip("25")).toHaveAttribute("aria-pressed", "false");
    expect(plateChip("20")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("You")).toHaveValue("");
    expect(screen.getByLabelText("Buddy")).toHaveValue("");
  });

  it("does not remember the total for just me", async () => {
    const first = render(<PlatesTab />);
    await type("Total weight", "75");
    first.unmount();
    render(<PlatesTab />);
    expect(screen.getByLabelText("Total weight")).toHaveValue("");
  });

  it("starts from the defaults on a first visit", () => {
    render(<PlatesTab />);
    expect(screen.getByRole("button", { name: "Just me" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Machine starts at")).toHaveValue("");
    for (const p of ["25", "20", "15", "10", "5", "2.5", "1.25"]) {
      expect(plateChip(p)).toHaveAttribute("aria-pressed", "true");
    }
  });

  it.each([
    ["not json", "{not json"],
    ["a number", "42"],
    ["a string", '"x"'],
    ["wrong types", '{"plates":[7,"a"],"mode":"zzz","start":"abc"}'],
    ["no plates", '{"plates":[]}'],
  ])("falls back to the defaults when what is stored is %s", (_n, stored) => {
    localStorage.setItem("plates.prefs", stored);
    render(<PlatesTab />);
    expect(screen.getByRole("button", { name: "Just me" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Machine starts at")).toHaveValue("");
    for (const p of ["25", "20", "15", "10", "5", "2.5", "1.25"]) {
      expect(plateChip(p)).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("keeps only standard sizes from storage", () => {
    localStorage.setItem("plates.prefs", '{"mode":"me","start":"20","plates":[7,20,5,0.3]}');
    render(<PlatesTab />);
    expect(screen.getByLabelText("Machine starts at")).toHaveValue("20");
    const on = ["20", "5"];
    for (const p of ["25", "20", "15", "10", "5", "2.5", "1.25"]) {
      expect(plateChip(p)).toHaveAttribute("aria-pressed", String(on.includes(p)));
    }
  });

  it("works when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PlatesTab />);
    await type("Machine starts at", "20");
    await type("Total weight", "75");
    expect(screen.getByText("27.5 kg")).toBeInTheDocument();
  });
});

