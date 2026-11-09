import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { persister } from "../src/lib/persister";
import { createQueryClient } from "../src/lib/queryClient";

/**
 * A session that ends somewhere else: it expired, or a password reset signed
 * every device out. Nobody pressed sign-out here, so the 401 is the only news.
 */

const ME = { id: "1", email: "a@b.com", demo: false };
const unauthorized = () => new ApiError(401, "Not authenticated", "unauthorized");

/** The API by path (CLAUDE.md: never by call order). Each entry answers or throws. */
function mockApi(routes: Record<string, () => unknown>) {
  return vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const route = routes[path];
    if (!route) throw new Error(`unmocked ${path}`);
    return route() as never;
  });
}

function Probe() {
  const { user, loading } = useAuth();
  const weights = useQuery({
    queryKey: ["weights"],
    queryFn: () => apiModule.api<number[]>("/api/weight"),
    enabled: !!user,
    retry: false,
  });
  const other = useQuery({
    queryKey: ["habits"],
    queryFn: () => apiModule.api<number[]>("/api/habits"),
    enabled: !!user,
    retry: false,
  });
  const save = useMutation({ mutationFn: () => apiModule.api("/api/auth/change-password", { method: "POST" }) });
  return (
    <div>
      <span data-testid="state">{loading ? "loading" : user ? `in:${user.email}` : "out"}</span>
      <span data-testid="weights">{weights.data ? weights.data.join(",") : "none"}</span>
      <button onClick={() => void weights.refetch()}>refetch</button>
      <button onClick={() => void Promise.all([weights.refetch(), other.refetch()])}>refetch both</button>
      <button onClick={() => save.mutate()}>save</button>
    </div>
  );
}

function renderApp() {
  const qc = createQueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const meCalls = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.filter((c) => c[0] === "/api/auth/me").length;

afterEach(() => vi.restoreAllMocks());

describe("a session that ended elsewhere", () => {
  it("signs this device out, and empties both copies of the cache, when a query is refused", async () => {
    let live = true;
    const spy = mockApi({
      "/api/auth/me": () => {
        if (!live) throw unauthorized();
        return ME;
      },
      "/api/weight": () => {
        if (!live) throw unauthorized();
        return [80, 81];
      },
      "/api/habits": () => [],
    });
    const purge = vi.spyOn(persister, "removeClient");

    const qc = renderApp();
    await waitFor(() => expect(screen.getByTestId("weights")).toHaveTextContent("80,81"));
    expect(purge).not.toHaveBeenCalled();
    expect(meCalls(spy)).toBe(1);

    // The server forgets the session; the next fetch is the first to hear.
    live = false;
    await act(async () => {
      screen.getByText("refetch").click();
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
    expect(screen.getByTestId("weights")).toHaveTextContent("none");
    expect(qc.getQueryData(["weights"])).toBeUndefined();
    expect(purge).toHaveBeenCalled();
  });

  it("asks /me once when a page's queries are refused together", async () => {
    let live = true;
    const refuse = <T,>(value: T) => () => {
      if (!live) throw unauthorized();
      return value;
    };
    const spy = mockApi({
      "/api/auth/me": refuse(ME),
      "/api/weight": refuse([80]),
      "/api/habits": refuse([1]),
    });

    renderApp();
    await waitFor(() => expect(screen.getByTestId("weights")).toHaveTextContent("80"));

    live = false;
    await act(async () => {
      screen.getByText("refetch both").click();
    });

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
    // The first check at boot, and one for the pair of refusals.
    expect(meCalls(spy)).toBe(2);
  });

  it("stays signed in, with its cache, when the 401 was a wrong password", async () => {
    const spy = mockApi({
      "/api/auth/me": () => ME,
      "/api/weight": () => [80, 81],
      "/api/habits": () => [],
      "/api/auth/change-password": () => {
        throw new ApiError(401, "Current password is incorrect", "unauthorized");
      },
    });
    const purge = vi.spyOn(persister, "removeClient");

    const qc = renderApp();
    await waitFor(() => expect(screen.getByTestId("weights")).toHaveTextContent("80,81"));

    await act(async () => {
      screen.getByText("save").click();
    });

    // /me was asked, said the session is fine, and nothing was thrown away.
    await waitFor(() => expect(meCalls(spy)).toBe(2));
    expect(screen.getByTestId("state")).toHaveTextContent("in:a@b.com");
    expect(qc.getQueryData(["weights"])).toEqual([80, 81]);
    expect(purge).not.toHaveBeenCalled();
  });

  it("empties the saved cache when the app opens on a session that has ended", async () => {
    mockApi({
      "/api/auth/me": () => {
        throw unauthorized();
      },
    });
    const purge = vi.spyOn(persister, "removeClient");
    const qc = createQueryClient();
    // What the persisted copy restored at boot: the previous session's data.
    qc.setQueryData(["weights"], [80, 81]);

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
    expect(qc.getQueryData(["weights"])).toBeUndefined();
    expect(purge).toHaveBeenCalled();
  });

  it("keeps the saved cache when the check could not be made at all", async () => {
    // Offline or a 500 is "couldn't tell", not "signed out": nothing is purged.
    mockApi({
      "/api/auth/me": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const purge = vi.spyOn(persister, "removeClient");
    const qc = createQueryClient();
    qc.setQueryData(["weights"], [80, 81]);

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("out"));
    expect(qc.getQueryData(["weights"])).toEqual([80, 81]);
    expect(purge).not.toHaveBeenCalled();
  });
});
