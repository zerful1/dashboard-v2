import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          // No retries: the point here is what the settled failure renders,
          // and the app's own `retry: 1` would only make the test slower.
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

const PROFILE = {
  user_id: "1",
  display_name: "Alice",
  avatar_path: null,
  units: "kg",
  timezone: "Europe/London",
  updated_at: "",
};

/** Serves the page, and captures the DELETE it sends. Mocked by PATH. */
function mockWithDelete() {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/me") return { id: "1", email: "a@b.com" } as never;
    if (path === "/api/profile" && (init?.method ?? "GET") === "GET") return PROFILE as never;
    if (path === "/api/profile" && init?.method === "DELETE") {
      calls.push({ path, init });
      // Never resolves: onSuccess would assign window.location, which jsdom
      // cannot perform. The body is captured at call time regardless.
      return new Promise(() => {}) as never;
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
  });
  return calls;
}

describe("SettingsPage account deletion", () => {
  it("keeps the delete button disabled until a password is typed", async () => {
    mockWithDelete();
    renderPage();
    const button = await screen.findByRole("button", { name: /delete account/i });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/confirm with your password/i), "hunter2");
    expect(button).toBeEnabled();
  });

  it("sends the typed password with the delete request", async () => {
    const calls = mockWithDelete();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await userEvent.type(
      await screen.findByLabelText(/confirm with your password/i),
      "hunter2",
    );
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ password: "hunter2" });
  });
});

describe("SettingsPage", () => {
  // The failure this pins is silent by construction: in TanStack Query v5 a
  // settled-with-error query has isLoading false and data undefined, so a
  // guard written as `isLoading || !profile` falls through to the spinner and
  // stays there. Nothing throws, nothing logs, and the page says "loading"
  // about a request that stopped a minute ago. The database this reads
  // through pauses when it has been idle for a week, so it is a live case.
  it("renders an error with a retry, not a spinner, when the profile query fails", async () => {
    const spy = vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path === "/api/auth/me") return { id: "1", email: "a@b.com" };
      throw new ApiError(503, "Service Unavailable");
    });

    renderPage();

    const retry = await screen.findByRole("button", { name: /try again/i });

    // Both halves matter. An error that appears *next to* a permanent spinner
    // would satisfy "an error is shown" while leaving the page just as stuck.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(retry).toBeInTheDocument();

    // And the retry is wired to a refetch rather than being decoration.
    const before = spy.mock.calls.filter((c) => c[0] === "/api/profile").length;
    await userEvent.click(retry);
    await waitFor(() =>
      expect(spy.mock.calls.filter((c) => c[0] === "/api/profile").length).toBeGreaterThan(before),
    );
  });
});
