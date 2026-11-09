import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { Sheet } from "../src/components/ui/Sheet";

/**
 * The sheet declares aria-modal, so a keyboard or a screen reader takes it at
 * its word. Focus used to stay on the button behind the backdrop, Tab walked
 * the page underneath, and closing left focus nowhere.
 */

function Harness({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      <button>behind</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit weight">
        {children ?? (
          <>
            <input aria-label="first" />
            <button>middle</button>
            <button>last</button>
          </>
        )}
      </Sheet>
    </div>
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Edit weight" });

describe("Sheet focus", () => {
  it("moves focus into the sheet on opening, onto the sheet and not its first field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("open"));

    // The sheet itself: focusing the input would raise a phone's keyboard.
    expect(dialog()).toHaveFocus();
    expect(screen.getByLabelText("first")).not.toHaveFocus();
  });

  it("leaves focus with a child that asked for it", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <input aria-label="name" autoFocus />
      </Harness>,
    );
    await user.click(screen.getByText("open"));

    expect(screen.getByLabelText("name")).toHaveFocus();
  });

  it("keeps Tab inside the sheet, in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("open"));

    await user.tab();
    expect(screen.getByLabelText("first")).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByText("last")).toHaveFocus();
    // Past the end: round to the start, never out to "behind".
    await user.tab();
    expect(screen.getByLabelText("first")).toHaveFocus();
    // And backwards from the start to the end.
    await user.tab({ shift: true });
    expect(screen.getByText("last")).toHaveFocus();
    expect(screen.getByText("behind")).not.toHaveFocus();
  });

  it("holds focus on a sheet with nothing to tab to", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <p>Nothing to press.</p>
      </Harness>,
    );
    await user.click(screen.getByText("open"));

    await user.tab();

    expect(dialog()).toHaveFocus();
  });

  it("gives focus back to what opened it on closing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("open"));
    expect(dialog()).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByText("open")).toHaveFocus());
  });
});
