import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateEyebrow } from "../src/components/ui/DateEyebrow";

function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 7, 12)); // Wed 2026-10-07
}
afterEach(() => vi.useRealTimers());

describe("DateEyebrow", () => {
  it("is the date picker, capped at today, with no Back to today on today", () => {
    freeze();
    render(<DateEyebrow date="2026-10-07" onDate={vi.fn()} />);
    const input = screen.getByLabelText("Change date — currently today");
    expect(input).toHaveValue("2026-10-07");
    expect(input).toHaveAttribute("max", "2026-10-07");
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull();
  });

  it("offers Back to today on another day, and picks today with it", async () => {
    freeze();
    const onDate = vi.fn();
    render(<DateEyebrow date="2026-10-01" onDate={onDate} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(onDate).toHaveBeenCalledWith("2026-10-07");
  });

  it("passes a picked date on, and ignores a cleared picker", () => {
    freeze();
    const onDate = vi.fn();
    render(<DateEyebrow date="2026-10-07" onDate={onDate} />);
    const input = screen.getByLabelText(/change date/i);
    fireEvent.change(input, { target: { value: "2026-10-02" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(onDate).toHaveBeenCalledTimes(1);
    expect(onDate).toHaveBeenCalledWith("2026-10-02");
  });
});
