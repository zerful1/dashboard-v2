import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { ProtectedRoute } from "../src/auth/ProtectedRoute";
import { MemoryRouter } from "react-router-dom";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { persister } from "../src/lib/persister";
import { createQueryClient } from "../src/lib/queryClient";
import { readSavedUser, saveUser } from "../src/auth/savedUser";

/**
 * Opening the app with no signal. The saved data was on the device all along,
 * but the app asked the server who was signed in before showing any of it, so
 * a start with no signal ended on "We couldn't check your session".
 */

const ME = { id: "1", email: "a@b.com", demo: false };
const offline = () => new TypeError("Failed to fetch");

/** The API by path (CLAUDE.md: never by call order). Each entry answers or throws. */
function mockApi(routes: Record<string, () => unknown>) {
  return vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const route = routes[path];
    if (!route) throw new Error(`unmocked ${path}`);
    return route() as never;
  });
}

function Probe() {
  const { user, loading, sessionError, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">{loading ? "loading" : user ? `in:${user.email}` : "out"}</span>
      <span data-testid="session-error">{sessionError ? "error" : "none"}</span>
      <button onClick={() => void login("c@d.com", "password-1").catch(() => {})}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderAuth(children = <Probe />) {
  const qc = createQueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const state = () => screen.getByTestId("state");

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("starting with no signal", () => {
  it("remembers who signed in once the server has said so", async () => {
    mockApi({ "/api/auth/me": () => ME });
    expect(readSavedUser()).toBeNull();

    renderAuth();
    await waitFor(() => expect(state()).toHaveTextContent("in:a@b.com"));

    expect(readSavedUser()).toEqual(ME);
  });

  it("opens on the remembered user, with the saved cache, instead of the retry card", async () => {
    saveUser(ME);
    mockApi({ "/api/auth/me": () => { throw offline(); } });
    const purge = vi.spyOn(persister, "removeClient");
    const qc = createQueryClient();
    qc.setQueryData(["weights", ME.id], [80, 81]);

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter>
            <ProtectedRoute>
              <p>the app</p>
            </ProtectedRoute>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // The app itself, not "We couldn't check your session".
    expect(await screen.findByText("the app")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(qc.getQueryData(["weights", ME.id])).toEqual([80, 81]);
    expect(purge).not.toHaveBeenCalled();
  });

  it("counts a check that timed out as no signal", async () => {
    saveUser(ME);
    mockApi({ "/api/auth/me": () => { throw new ApiError(0, "Timed out", "timeout"); } });

    renderAuth();

    await waitFor(() => expect(state()).toHaveTextContent("in:a@b.com"));
    expect(screen.getByTestId("session-error")).toHaveTextContent("none");
  });

  it("still shows the retry card when nobody is remembered", async () => {
    mockApi({ "/api/auth/me": () => { throw offline(); } });

    renderAuth();

    await waitFor(() => expect(state()).toHaveTextContent("out"));
    expect(screen.getByTestId("session-error")).toHaveTextContent("error");
  });

  it("does not open on the remembered user when the server answered with an error", async () => {
    // A 500 is an answer, and not "carry on": couldn't tell, as before.
    saveUser(ME);
    mockApi({ "/api/auth/me": () => { throw new ApiError(500, "Internal Server Error"); } });

    renderAuth();

    await waitFor(() => expect(state()).toHaveTextContent("out"));
    expect(screen.getByTestId("session-error")).toHaveTextContent("error");
    // Not forgotten either: the next start may have no signal.
    expect(readSavedUser()).toEqual(ME);
  });

  it("ignores a remembered user it can't read", async () => {
    for (const junk of ["{not json", "null", JSON.stringify({ id: 7, email: "a@b.com" }), JSON.stringify({ email: "a@b.com" })]) {
      window.localStorage.setItem("dashboard-last-user", junk);
      expect(readSavedUser(), junk).toBeNull();
    }
  });
});

describe("the remembered user is settled by the server", () => {
  it("asks again when the signal returns, and signs out and purges if the session had ended", async () => {
    saveUser(ME);
    let reachable = false;
    const spy = mockApi({
      "/api/auth/me": () => {
        if (!reachable) throw offline();
        throw new ApiError(401, "Not authenticated", "unauthorized");
      },
    });
    const purge = vi.spyOn(persister, "removeClient");
    const qc = renderAuth();
    qc.setQueryData(["weights", ME.id], [80, 81]);
    await waitFor(() => expect(state()).toHaveTextContent("in:a@b.com"));

    reachable = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(state()).toHaveTextContent("out"));
    expect(spy.mock.calls.filter((c) => c[0] === "/api/auth/me")).toHaveLength(2);
    expect(qc.getQueryData(["weights", ME.id])).toBeUndefined();
    expect(purge).toHaveBeenCalled();
    expect(readSavedUser()).toBeNull();
  });

  it("stays in when the signal returns and the session is fine, and stops asking", async () => {
    saveUser(ME);
    let reachable = false;
    const spy = mockApi({
      "/api/auth/me": () => {
        if (!reachable) throw offline();
        return ME;
      },
    });
    renderAuth();
    await waitFor(() => expect(state()).toHaveTextContent("in:a@b.com"));

    reachable = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(spy.mock.calls.filter((c) => c[0] === "/api/auth/me")).toHaveLength(2));
    expect(state()).toHaveTextContent("in:a@b.com");

    // Confirmed now: a flicker of the wifi is not a reason to ask again.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(spy.mock.calls.filter((c) => c[0] === "/api/auth/me")).toHaveLength(2);
  });

  it("does not ask on 'online' when the session was confirmed at the start", async () => {
    const spy = mockApi({ "/api/auth/me": () => ME });
    renderAuth();
    await waitFor(() => expect(state()).toHaveTextContent("in:a@b.com"));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(spy.mock.calls.filter((c) => c[0] === "/api/auth/me")).toHaveLength(1);
  });
});

describe("the remembered user never outlives the cache", () => {
  it("is forgotten on sign-out", async () => {
    mockApi({ "/api/auth/me": () => ME, "/api/auth/logout": () => undefined });
    renderAuth();
    await waitFor(() => expect(readSavedUser()).toEqual(ME));

    await act(async () => {
      screen.getByText("logout").click();
    });

    await waitFor(() => expect(state()).toHaveTextContent("out"));
    expect(readSavedUser()).toBeNull();
  });

  it("is forgotten when the server says nobody is signed in", async () => {
    saveUser(ME);
    mockApi({ "/api/auth/me": () => { throw new ApiError(401, "Not authenticated", "unauthorized"); } });

    renderAuth();

    await waitFor(() => expect(state()).toHaveTextContent("out"));
    expect(readSavedUser()).toBeNull();
  });

  it("is never who a new sign-in falls back to if the signal drops before /me", async () => {
    // Someone else signs in on a device that remembers A; the POST lands and
    // then the signal goes. The app must not open as A.
    let signedOut = true;
    mockApi({
      "/api/auth/me": () => {
        if (signedOut) throw new ApiError(401, "Not authenticated", "unauthorized");
        throw offline();
      },
      "/api/auth/login": () => undefined,
    });
    renderAuth();
    await waitFor(() => expect(state()).toHaveTextContent("out"));
    saveUser(ME);
    signedOut = false;

    await act(async () => {
      screen.getByText("login").click();
    });

    await waitFor(() => expect(screen.getByTestId("session-error")).toHaveTextContent("error"));
    expect(state()).toHaveTextContent("out");
    expect(readSavedUser()).toBeNull();
  });
});
