import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateSelector } from "../src/components/ui/DateSelector";

function freeze(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, 12));
}

afterEach(() => vi.useRealTimers());

const input = () => document.querySelector('input[type="date"]') as HTMLInputElement;

describe("DateSelector", () => {
  /** iOS opens its date picker only on a direct tap or focus of the input, so it must be the real. */
  it("exposes the native input as the real control", () => {
    freeze("2026-08-31");
    render(<DateSelector value="2026-08-31" onChange={() => {}} />);
    const el = input();

    // Not nested in a button: invalid HTML, and iOS will not deliver the tap.
    expect(el.closest("button")).toBeNull();
    // Reachable: not aria-hidden, not tabIndex -1, and it carries the name.
    expect(el).not.toHaveAttribute("aria-hidden");
    expect(el.tabIndex).not.toBe(-1);
    expect(screen.getByLabelText(/change date/i)).toBe(el);
    // Tappable: jsdom applies no stylesheet, so the class is the only thing that can be checked.
    expect(el.className).not.toMatch(/pointer-events-none/);
  });

  it("names today as Today, and other dates by day and month", () => {
    freeze("2026-08-31");
    const { rerender } = render(<DateSelector value="2026-08-31" onChange={() => {}} />);
    expect(screen.getByText("Today")).toBeInTheDocument();

    rerender(<DateSelector value="2026-08-10" onChange={() => {}} />);
    // Locale-formatted, so match the parts rather than the order.
    expect(screen.getByText(/mon/i)).toHaveTextContent(/10/);
  });

  it("refuses future dates via max", () => {
    freeze("2026-08-31");
    render(<DateSelector value="2026-08-31" onChange={() => {}} />);
    expect(input().max).toBe("2026-08-31");
  });

  it("reports a picked date", () => {
    freeze("2026-08-31");
    const onChange = vi.fn();
    render(<DateSelector value="2026-08-31" onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "2026-08-10" } });
    expect(onChange).toHaveBeenCalledWith("2026-08-10");
  });

  it("ignores the picker being cleared", () => {
    // A cleared picker fires a change with "", which must not put an empty date on the wire.
    freeze("2026-08-31");
    const onChange = vi.fn();
    render(<DateSelector value="2026-08-31" onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  // One clock per page: just after midnight the clock says the 18th while the page's useToday says the 17th.
  it("takes the page's today when given one, not its own clock", () => {
    freeze("2026-08-18");
    render(<DateSelector value="2026-08-17" onChange={() => {}} today="2026-08-17" />);
    expect(input().max).toBe("2026-08-17");
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});
