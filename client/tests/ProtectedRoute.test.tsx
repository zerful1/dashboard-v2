import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../src/auth/ProtectedRoute";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

// A real MemoryRouter with a real /login route (rather than just asserting on
// a spinner) so "no redirect happened" is checked directly: if ProtectedRoute
// ever regressed to redirecting on sessionError or while loading, this route
// would render and the assertions below would fail for the right reason.
function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ProtectedRoute", () => {
  it("renders a spinner and neither the children nor /login while the session is loading", () => {
    // Never resolves, so the component stays in the initial loading state —
    // same "in flight" pattern used in LoginPage.test.tsx.
    vi.spyOn(apiModule, "api").mockImplementation(() => new Promise(() => {}));

    renderProtected();

    expect(screen.getByRole("status", { name: /checking your session/i })).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login Screen")).not.toBeInTheDocument();
  });

  it("shows a retry affordance and does not redirect to /login when the session check fails", async () => {
    // A non-401 failure: AuthProvider records it as sessionError rather than
    // treating it as signed-out. This is the branch the ruling exists for.
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValue(new ApiError(500, "Internal Server Error"));

    renderProtected();

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.queryByText("Login Screen")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    // The raw server error is not something the user can act on — only the
    // calm retry copy and control should be present.
    expect(screen.queryByText(/internal server error/i)).not.toBeInTheDocument();

    // The retry control is wired to refreshAuth(), not just decorative.
    const callsBefore = spy.mock.calls.length;
    await userEvent.click(retry);
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("redirects to /login when genuinely signed out", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));

    renderProtected();

    await waitFor(() => expect(screen.getByText("Login Screen")).toBeInTheDocument());
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("renders the protected children when signed in", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue({ id: "1", email: "a@b.com" });

    renderProtected();

    await waitFor(() => expect(screen.getByText("Protected Content")).toBeInTheDocument());
    expect(screen.queryByText("Login Screen")).not.toBeInTheDocument();
  });
});
