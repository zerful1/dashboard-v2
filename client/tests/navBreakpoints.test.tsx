import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomTabs } from "../src/layout/BottomTabs";
import { NavRail } from "../src/layout/NavRail";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false, logout: vi.fn() }),
}));

describe("navigation", () => {
  // CLAUDE.md: the two navs must switch at the same width, or a band of widths
  // has none. jsdom never evaluates media queries, so the classes are the test.
  it("switches the bottom tabs and the rail at exactly the same breakpoint", () => {
    const { container } = render(
      <MemoryRouter>
        <BottomTabs onMore={() => {}} />
        <NavRail />
      </MemoryRouter>,
    );
    expect(container.querySelector("nav")).toHaveClass("xl:hidden");
    expect(container.querySelector("aside")).toHaveClass("hidden", "xl:flex");
  });

  it("labels the tabs in sentence case and marks the current one", () => {
    render(
      <MemoryRouter initialEntries={["/weight"]}>
        <BottomTabs onMore={() => {}} />
      </MemoryRouter>,
    );
    const current = screen.getByRole("link", { name: "Weight" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.querySelector('[data-part="dot"]')).toHaveClass("bg-accent");
    expect(screen.getByRole("link", { name: "Home" }).querySelector('[data-part="dot"]')).not.toHaveClass("bg-accent");
  });

  it("shows the trend-line mark beside the wordmark", () => {
    const { container } = render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(container.querySelector("aside svg polyline")).not.toBeNull();
  });
});
