import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { BodyWeightEntry } from "@dashboard/shared";
import { WeightPage } from "../src/features/weight/WeightPage";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const entry = (date: string, weight_kg: number): BodyWeightEntry => ({
  id: `w-${date}`, user_id: "u1", date, weight_kg, notes: null, created_at: `${date}T08:00:00Z`,
});
const ENTRIES = [entry("2026-10-06", 82.4), entry("2026-10-05", 82.9)];

/** By path. `failing` turns the weight list into a server error from then on. */
function mockApi() {
  const state = { failing: false };
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/weight")) {
      if (state.failing) throw new ApiError(500, "boom");
      return ENTRIES as never;
    }
    if (path.startsWith("/api/goals")) return [] as never;
    throw new Error(`unmocked path: ${path}`);
  });
  return state;
}

function renderPage() {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  render(
    <QueryClientProvider client={qc}>
      <WeightPage />
    </QueryClientProvider>,
  );
  return qc;
}

afterEach(() => vi.restoreAllMocks());

// Deferred from #31: the same defect as Home's, on the Weight page.
describe("Weight page, when loading fails", () => {
  it("keeps your history when a refresh fails", async () => {
    const api = mockApi();
    const qc = renderPage();
    expect(await screen.findByText("Body weight")).toBeInTheDocument();
    expect(screen.getAllByText(/82\.9/).length).toBeGreaterThan(0);

    api.failing = true;
    await act(() => qc.refetchQueries({ queryKey: ["weight"] }));
    await waitFor(() => expect(qc.getQueryState(["weight", "u1"])?.status).toBe("error"));

    expect(screen.queryByText("Could not load")).toBeNull();
    expect(screen.getAllByText(/82\.9/).length).toBeGreaterThan(0);
  });

  it("says so when there is nothing to show", async () => {
    const api = mockApi();
    api.failing = true;
    renderPage();
    expect(await screen.findByText("Could not load")).toBeInTheDocument();
  });
});
