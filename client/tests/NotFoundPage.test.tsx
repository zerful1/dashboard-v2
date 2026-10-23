import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFoundPage } from "../src/pages/NotFoundPage";
import { NAV_ITEMS } from "../src/layout/navItems";

describe("NotFoundPage", () => {
  // An old /media link lands here, inside the app.
  it("says the page doesn't exist, with a way home", () => {
    render(
      <MemoryRouter initialEntries={["/media"]}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("That address doesn't match anything in this app.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  });

  it("offers no Media tab", () => {
    expect(NAV_ITEMS.some((i) => (i.to as string) === "/media")).toBe(false);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Weight", "Gym", "Food", "Insights", "Habits", "Settings"]);
  });
});
