import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "../src/components/ui/Tabs";

const TABS = [
  { id: "search", label: "Search" },
  { id: "recent", label: "Recent" },
] as const;

describe("Tabs", () => {
  it("marks the chosen tab selected, and only that one", () => {
    render(<Tabs tabs={TABS} value="recent" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Recent" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "false");
  });

  it("selects nothing while the value is still being decided", () => {
    render(<Tabs tabs={TABS} value={null} onChange={() => {}} />);
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveAttribute("aria-selected", "false");
  });

  it("reports the tab that was clicked", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="recent" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(onChange).toHaveBeenCalledWith("search");
  });
});
