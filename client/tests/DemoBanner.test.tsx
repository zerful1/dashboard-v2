import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoBanner } from "../src/components/ui/DemoBanner";

// vi.mock is hoisted above everything, so its state comes from vi.hoisted.
const auth = vi.hoisted(() => ({ demo: true, logout: vi.fn(async () => {}) }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "d", email: "demo@demo.invalid", demo: auth.demo }, logout: auth.logout }),
}));

describe("DemoBanner", () => {
  it("tells a demo visitor that nothing is saved, and lets them leave", async () => {
    auth.demo = true;
    render(<DemoBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Demo · browse freely, changes aren't saved");
    await userEvent.click(screen.getByRole("button", { name: "Leave demo" }));
    expect(auth.logout).toHaveBeenCalled();
  });

  it("renders nothing for a normal account", () => {
    auth.demo = false;
    const { container } = render(<DemoBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
