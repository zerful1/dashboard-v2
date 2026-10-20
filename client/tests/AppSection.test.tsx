import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AppSection } from "../src/features/settings/AppSection";
import { versionText } from "../src/lib/buildInfo";
import * as refresh from "../src/lib/refreshApp";

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => vi.restoreAllMocks());

describe("versionText", () => {
  it("gives the build's date and short commit, or dev", () => {
    expect(versionText("201d09b3c1f2e4", "2026-10-16")).toBe("Version 16 Oct · 201d09b");
    expect(versionText("", "")).toBe("Version dev");
  });
});

describe("AppSection", () => {
  it("refreshes the app when asked", async () => {
    const spy = vi.spyOn(refresh, "refreshApp").mockResolvedValue(true);
    renderSection();
    expect(screen.getByText("Version dev")).toBeInTheDocument();
    expect(screen.getByText("For when it looks out of date. Your data stays on the server.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh the app" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("says so when the server can't be reached, and clears nothing", async () => {
    vi.spyOn(refresh, "refreshApp").mockResolvedValue(false);
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Refresh the app" }));
    expect(await screen.findByText("Couldn't reach the server, so nothing was cleared.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh the app" })).toBeEnabled();
  });

  // Review focus 4: with no signal, emptying the caches leaves nothing to load.
  it("is disabled offline, and says why", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderSection();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("button", { name: "Refresh the app" })).toBeDisabled();
    expect(screen.getByText("Needs a connection")).toBeInTheDocument();
  });
});

// Housekeeping PR 4: the project page is linked from Settings' App section.
describe("AppSection, the project page", () => {
  it("links to the project page", () => {
    renderSection();
    expect(screen.getByRole("link", { name: "About this project" })).toHaveAttribute("href", "/about");
  });

  // ShortcutList's rows are py-3 (44 px); this one was 32 px to tap.
  it("gives the row a full-height tap area", () => {
    renderSection();
    expect(screen.getByRole("link", { name: "About this project" })).toHaveClass("py-3");
  });
});
