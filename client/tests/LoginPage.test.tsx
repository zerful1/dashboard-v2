import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../src/pages/LoginPage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("LoginPage", () => {
  it("shows the API's message on bad credentials without inventing detail", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // initial /me
    spy.mockRejectedValueOnce(new ApiError(401, "Invalid email or password"));

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password");
    // Must not leak whether the account exists.
    expect(alert).not.toHaveTextContent(/no account|not found|unknown/i);
  });

  it("disables the button while the request is in flight", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));
    spy.mockImplementationOnce(() => new Promise(() => {})); // never resolves

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password-1");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled(),
    );
  });
});
