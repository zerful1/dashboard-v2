import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PlateSleeve } from "../src/features/gym/PlateSleeve";

describe("PlateSleeve", () => {
  it("says in words what stays on and what comes on and off, when there are outer plates", () => {
    render(<PlateSleeve inner={[15]} outer={[10, 2.5]} />);
    expect(
      screen.getByRole("img", {
        name: "Each side: 15 kg stays on; 10 kg and 2.5 kg come on and off",
      }),
    ).toBeInTheDocument();
  });

  it("says there are no plates when there are none", () => {
    render(<PlateSleeve inner={[]} />);
    expect(screen.getByRole("img", { name: "No plates" })).toBeInTheDocument();
  });

  it("says in words which plates are on each side, when there are no outer plates", () => {
    render(<PlateSleeve inner={[25, 2.5]} />);
    expect(screen.getByRole("img", { name: "Each side: 25 kg and 2.5 kg" })).toBeInTheDocument();
  });

  it("labels each plate with its number, inner then outer, in the order given", () => {
    render(<PlateSleeve inner={[25, 2.5]} outer={[10, 1.25]} />);
    const labels = within(screen.getByRole("img")).getAllByText(/^[\d.]+$/);
    expect(labels.map((el) => el.textContent)).toEqual(["25", "2.5", "10", "1.25"]);
  });

  it("marks outer plates as the ones that move, and inner plates as staying on", () => {
    render(<PlateSleeve inner={[15]} outer={[10]} />);
    const img = screen.getByRole("img");
    expect(within(img).getByText("15")).toHaveAttribute("data-moves", "false");
    expect(within(img).getByText("10")).toHaveAttribute("data-moves", "true");
  });

  it("draws a heavier plate taller than a lighter one, and keeps the smallest tall enough for its label", () => {
    render(<PlateSleeve inner={[25, 10, 1.25]} />);
    const img = screen.getByRole("img");
    const height = (label: string) => parseFloat(within(img).getByText(label).style.height);
    expect(height("25")).toBeGreaterThan(height("10"));
    expect(height("1.25")).toBeGreaterThanOrEqual(20);
  });
});
