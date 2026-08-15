import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomePage } from "../src/pages/HomePage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import type { Profile } from "@dashboard/shared";

const PROFILE: Profile = {
  user_id: "1",
  display_name: "Alice",
  avatar_path: null,
  units: "kg",
  timezone: "Europe/London",
  updated_at: "2026-08-15T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Serves /me and lets each test decide what the profile request does. */
function mockApi(profile: () => Promise<Profile>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path === "/api/auth/me") return { id: "1", email: "you@example.com" };
    if (path === "/api/profile") return profile();
    throw new Error(`unexpected ${path}`);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("HomePage heading", () => {
  it("shows the display name once the profile loads", async () => {
    mockApi(async () => PROFILE);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alice"),
    );
  });

  // The case that makes `||` the right operator rather than `??`. display_name
  // is `NOT NULL DEFAULT ''`, so every freshly registered user has one — and an
  // empty string is present, not nullish. Written with `??` this renders a
  // blank heading, which is silent: nothing errors, the page just looks broken
  // for exactly the users seeing it for the first time.
  it("falls back to the email when display_name is empty", async () => {
    mockApi(async () => ({ ...PROFILE, display_name: "" }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("you@example.com"),
    );
  });

  it("falls back to the email when the profile request fails", async () => {
    mockApi(async () => {
      throw new ApiError(503, "Service Unavailable");
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("you@example.com"),
    );
    // A failure here degrades rather than announcing itself — the heading is
    // still correct, so there is nothing for the user to act on.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
