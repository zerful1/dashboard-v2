import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../src/components/ui/Button";

describe("Button, disabled", () => {
  // Final review: a disabled `subtle` choice (Add food's "g" for a food that
  // can't be weighed) took the disabled grey fill, and sat beside the selected
  // grey pill looking like a second selection.
  it("draws a disabled unchosen choice without a fill, so it can't pass for the selected one", () => {
    render(<Button variant="subtle" disabled>g</Button>);
    const button = screen.getByRole("button", { name: "g" });
    expect(button).toHaveClass("disabled:bg-transparent");
    expect(button).not.toHaveClass("disabled:bg-raised");
  });

  // The positive complement: a disabled action still turns dark grey, so a
  // disabled primary never reads as the one action.
  it("still greys a disabled primary", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("disabled:bg-raised");
  });
});
