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

// The project page is linked from here.
describe("LoginPage, the project page", () => {
  it("links to the project page", async () => {
    // Only the session check is called, and it says signed out.
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));
    renderPage();
    expect(await screen.findByRole("link", { name: /^About this project/ })).toHaveAttribute("href", "/about");
  });
});

// The sign-in redesign: strangers (the CV links here) get the demo and the
// project page; sign-ups are closed, so nothing offers an account.
describe("LoginPage, for a visitor", () => {
  const signedOut = () => vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));

  it("makes the demo the one primary button, with sign-in outlined", async () => {
    signedOut();
    renderPage();
    const demo = await screen.findByRole("button", { name: "Try the demo" });
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(demo).toHaveClass("bg-accent");
    expect(signIn).not.toHaveClass("bg-accent");
    expect(signIn).toHaveClass("border");
  });

  it("says sign-ups are by invite, and offers no account", async () => {
    signedOut();
    renderPage();
    expect(await screen.findByText("Sign-ups are by invite only.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /register|sign up/i })).toBeNull();
  });

  it("names the app in its heading and keeps the form findable as Sign in", async () => {
    signedOut();
    renderPage();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Track your training, food and habits");
    expect(screen.getByRole("form", { name: "Sign in" })).toContainElement(screen.getByLabelText("Password"));
  });

  it("shows a failed demo under its own button, not in the form", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path === "/api/auth/demo") throw new ApiError(503, "The demo is unavailable");
      throw new ApiError(401, "Not authenticated");
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The demo is unavailable");
    expect(screen.getByRole("form", { name: "Sign in" })).not.toContainElement(alert);
  });
});
