import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../src/pages/LoginPage";
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
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it("opens the demo from its button", async () => {
    let signedIn = false;
    const spy = vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/auth/demo" && init?.method === "POST") {
        signedIn = true;
        return { id: "d", email: "demo@demo.invalid", demo: true } as never;
      }
      if (path === "/api/auth/me") {
        if (!signedIn) throw new ApiError(401, "Not authenticated");
        return { id: "d", email: "demo@demo.invalid", demo: true } as never;
      }
      throw new Error(`unexpected ${path}`);
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("/api/auth/demo", expect.objectContaining({ method: "POST" })));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// Housekeeping PR 4: the project page is linked from here.
describe("LoginPage, the project page", () => {
  it("links to the project page", async () => {
    // Only the session check is called, and it says signed out.
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));
    renderPage();
    expect(await screen.findByRole("link", { name: "About this project" })).toHaveAttribute("href", "/about");
  });
});
