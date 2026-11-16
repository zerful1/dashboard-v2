import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function Probe() {
  const { user, loading, sessionError, login, logout, refreshAuth } = useAuth();
  return (
    <div>
      <span data-testid="state">
        {loading ? "loading" : user ? `in:${user.email}` : "out"}
      </span>
      <span data-testid="session-error">{sessionError ? sessionError.message : "none"}</span>
      <button onClick={() => void login("a@b.com", "password-1")}>login</button>
      <button onClick={() => void logout()}>logout</button>
      <button onClick={() => void refreshAuth()}>refresh</button>
    </div>
  );
}

// AuthProvider clears the query cache on identity change, so it needs a QueryClientProvider.
function renderAuth(children: ReactNode = <Probe />) {
  const qc = new QueryClient({
    // staleTime matches App.tsx: it makes a surviving cache entry a permanent leak.
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AuthProvider", () => {
  it("starts loading, then resolves to signed out on 401", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));

    renderAuth();
    expect(screen.getByTestId("state")).toHaveTextContent("loading");

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
  });

  it("resolves to signed in when /me succeeds", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue({ id: "1", email: "a@b.com" });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com"));
  });

  it("re-fetches /me after login rather than trusting the login response", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // initial /me
    spy.mockResolvedValueOnce(undefined);                              // POST /login
    spy.mockResolvedValueOnce({ id: "1", email: "a@b.com" });          // /me again

    renderAuth();
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

    renderAuth();
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

  it("a non-401 failure on the initial check leaves user un-cleared and records sessionError", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(500, "Internal Server Error"));

    renderAuth();
    expect(screen.getByTestId("state")).toHaveTextContent("loading");
    expect(screen.getByTestId("session-error")).toHaveTextContent("none");

    // loading must still resolve to false even though the check failed.
    await waitFor(() => expect(screen.getByTestId("state")).not.toHaveTextContent("loading"));

    // user stays at its initial null and sessionError is populated.
    expect(screen.getByTestId("state")).toHaveTextContent("out");
    expect(screen.getByTestId("session-error")).toHaveTextContent("Internal Server Error");
  });

  it("a 401 rejection sets user to null and leaves sessionError null", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValue(new ApiError(401, "Not authenticated"));

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));

    // Assert both halves: this distinction is the whole point of the fix.
    expect(screen.getByTestId("state")).toHaveTextContent("out");
    expect(screen.getByTestId("session-error")).toHaveTextContent("none");
  });

  it("a successful refreshAuth() after a failed one clears sessionError", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(500, "Internal Server Error")); // initial /me fails
    spy.mockResolvedValueOnce({ id: "1", email: "a@b.com" }); // retry succeeds

    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("session-error")).toHaveTextContent("Internal Server Error"),
    );

    await act(async () => {
      screen.getByText("refresh").click();
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com"));
    expect(screen.getByTestId("session-error")).toHaveTextContent("none");
  });

  it("rejects a login whose follow-up /me proves no session was established", async () => {
    const spy = vi.spyOn(apiModule, "api");
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // initial /me
    spy.mockResolvedValueOnce(undefined);                              // POST /login succeeds
    spy.mockRejectedValueOnce(new ApiError(401, "Not authenticated")); // /me: no session stuck

    let outcome = "pending";
    function LoginProbe() {
      const { login } = useAuth();
      return (
        <button
          onClick={() => {
            void login("a@b.com", "password-1").then(
              () => { outcome = "fulfilled"; },
              () => { outcome = "rejected"; },
            );
          }}
        >
          login
        </button>
      );
    }

    renderAuth(<LoginProbe />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    await act(async () => { screen.getByText("login").click(); });

    // Without this, login() fulfils, ProtectedRoute redirects back to /login.
    expect(outcome).toBe("rejected");
  });
});

// The data-leak guard: see the cache note in AuthProvider for why the fix is a clear, not user-scoped keys.

describe("AuthProvider — the query cache does not survive an identity change", () => {
  /** Stands in for any page that caches per-user data. */
  function ProfilePane() {
    const { data } = useQuery({
      queryKey: ["profile"],
      queryFn: () => apiModule.api<{ timezone: string }>("/api/profile"),
    });
    return <span data-testid="profile">{data ? data.timezone : "none"}</span>;
  }

  function IdentityProbe() {
    const { user, loading, login, logout } = useAuth();
    return (
      <div>
        <span data-testid="who">{loading ? "loading" : (user?.email ?? "out")}</span>
        {user && <ProfilePane />}
        <button onClick={() => void login("bob@x.com", "password-1")}>sign in as bob</button>
        <button onClick={() => void logout()}>sign out</button>
      </div>
    );
  }

  /** A fake server whose current session is whatever `session` says it is. */
  function mockApi(initial: "alice" | "bob" | null) {
    let session = initial;
    const spy = vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path === "/api/auth/login") { session = "bob"; return undefined; }
      if (path === "/api/auth/logout") { session = null; return undefined; }
      if (!session) throw new ApiError(401, "Not authenticated");
      if (path === "/api/auth/me") return { id: session, email: `${session}@x.com` };
      if (path === "/api/profile") return { timezone: session === "alice" ? "Europe/London" : "Asia/Tokyo" };
      throw new Error(`unexpected request: ${path}`);
    });
    return spy;
  }

  it("does not serve one account's cached data to the next", async () => {
    mockApi("alice");
    const { qc } = renderAuth(<IdentityProbe />);

    // Alice's profile lands in the cache under ["profile"], a key with no identity in it.
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Europe/London"));

    await act(async () => { screen.getByText("sign out").click(); });
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("out"));

    // Empty, not merely unread: with staleTime at 30s a surviving entry is served to the next mount with no request.
    expect(qc.getQueryData(["profile"])).toBeUndefined();

    // Bob signs in on the same tab.
    await act(async () => { screen.getByText("sign in as bob").click(); });
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("bob@x.com"));

    // The whole finding in one line: Bob must never be shown Alice's data.
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Asia/Tokyo"));
    expect(screen.queryByText("Europe/London")).not.toBeInTheDocument();
  });

  it("a sign-in clears a cache left behind by a sign-out that never completed", async () => {
    mockApi(null);
    const { qc } = renderAuth(<IdentityProbe />);
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("out"));

    // A failed sign-out POST or a tab closed mid-request leaves this behind.
    qc.setQueryData(["profile"], { timezone: "Europe/London" });

    await act(async () => { screen.getByText("sign in as bob").click(); });
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("bob@x.com"));

    expect(qc.getQueryData(["profile"])).not.toEqual({ timezone: "Europe/London" });
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Asia/Tokyo"));
  });
});
