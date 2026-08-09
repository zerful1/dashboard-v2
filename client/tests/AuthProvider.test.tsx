import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">
        {loading ? "loading" : user ? `in:${user.email}` : "out"}
      </span>
      <button onClick={() => void login("a@b.com", "password-1")}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AuthProvider", () => {
  it("starts loading, then resolves to signed out on 401", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent("loading");

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
  });

  it("resolves to signed in when /me succeeds", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue({ id: "1", email: "a@b.com" });

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com"));
  });

  it("re-fetches /me after login rather than trusting the login response", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // initial /me
    spy.mockResolvedValueOnce(undefined);                              // POST /login
    spy.mockResolvedValueOnce({ id: "1", email: "a@b.com" });          // /me again

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));

    await act(async () => { screen.getByText("login").click(); });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com"));
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      "/api/auth/me", "/api/auth/login", "/api/auth/me",
    ]);
  });

  it("clears the user on logout without waiting for a refetch", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockResolvedValueOnce({ id: "1", email: "a@b.com" }); // initial /me
    spy.mockResolvedValueOnce(undefined);                     // POST /logout

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com"));

    await act(async () => { screen.getByText("logout").click(); });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
  });

  it("throws if useAuth is used outside the provider", () => {
    // Silence React's error boundary logging for this expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within AuthProvider/);
    spy.mockRestore();
  });
});
