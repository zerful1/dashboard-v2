import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterPage } from "../src/pages/RegisterPage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

// AuthProvider clears the query cache whenever the identity changes, so it
// needs a QueryClientProvider above it — as it has in App.tsx.
function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("RegisterPage", () => {
  // Repo owner's ask: pin both halves of the field-error mapping behaviour.
  // The brief's RegisterPage only shows the generic banner when
  // `Object.keys(fieldErrors).length === 0`, so a regression that showed
  // both the field error AND the generic banner would be a visible
  // double-reporting bug that this test would catch.
  it("maps ApiError.details to per-field errors instead of also showing the generic banner", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // initial /me
    spy.mockRejectedValueOnce(
      new ApiError(400, "Validation failed", "bad_request", {
        password: "String must contain at least 8 character(s)",
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    // The password field's own error is shown, associated to the input.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("String must contain at least 8 character(s)");
    expect(screen.getByLabelText(/password/i)).toHaveAccessibleDescription(
      "String must contain at least 8 character(s)",
    );

    // The generic banner (the ApiError's top-level message) must NOT also
    // appear — showing both would be double-reporting the same failure.
    expect(screen.queryByText("Validation failed")).not.toBeInTheDocument();
    // Exactly one alert on screen: the field-level one, not a duplicate.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
