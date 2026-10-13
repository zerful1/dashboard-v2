import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { shiftISO, type BodyWeightEntry, type Goal } from "@dashboard/shared";
import { WeightPage } from "../src/features/weight/WeightPage";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const TODAY = "2026-10-14"; // a Wednesday
const entry = (date: string, weight_kg: number): BodyWeightEntry => ({
  id: `w-${date}`, user_id: "u1", date, weight_kg, notes: null, created_at: `${date}T08:00:00Z`,
});
/** 20 daily weigh-ins ending today, newest first as the API sends them, falling 0.5 kg a week to 80. */
const HISTORY = Array.from({ length: 20 }, (_, i) => entry(shiftISO(TODAY, -i), Math.round((80 + (0.5 * i) / 7) * 10) / 10));
const GOAL: Goal = { id: "g", user_id: "u1", kind: "weight", exercise_name: null, target_kg: 78, start_kg: 84, created_at: "" };

interface Routes {
  weights?: BodyWeightEntry[] | Error;
  goals?: Goal[] | Error | Promise<Goal[]>;
}

/** By path, never by call order (CLAUDE.md). */
function mockApi(routes: Routes = {}) {
  const state = { weights: routes.weights ?? HISTORY };
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (method === "POST" && path === "/api/weight") return entry(body.date, body.weight_kg) as never;
    if (method === "DELETE" && path.startsWith("/api/weight/")) return undefined as never;
    if (path.startsWith("/api/weight")) {
      if (state.weights instanceof Error) throw state.weights;
      return state.weights as never;
    }
    if (path.startsWith("/api/goals")) {
      const goals = routes.goals ?? [GOAL];
      if (goals instanceof Error) throw goals;
      return (await goals) as never;
    }
    throw new Error(`unmocked path: ${method} ${path}`);
  });
  return { state, calls };
}

function renderPage(opts: { seed?: BodyWeightEntry[]; offline?: boolean } = {}) {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  if (opts.seed) qc.setQueryData(["weight", "u1"], opts.seed);
  if (opts.offline) onlineManager.setOnline(false);
  render(
    <QueryClientProvider client={qc}>
      <WeightPage />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  // Local noon, so the local calendar day is TODAY whatever the runner's timezone.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 12));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("Weight page", () => {
  it("opens on the 7-day average, the rate and the goal", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByText("7-day average", { selector: ".lbl" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weight" })).toBeInTheDocument();
    expect(screen.getByText(/kg a week/)).toBeInTheDocument();
    expect(screen.getByText(/^Goal 78 kg ·/)).toBeInTheDocument();
  });

  it("waits for the goals before drawing a conclusion", async () => {
    let release!: (goals: Goal[]) => void;
    mockApi({ goals: new Promise<Goal[]>((r) => (release = r)) });
    const qc = renderPage();
    await waitFor(() => expect(qc.getQueryData(["weight", "u1"])).toBeDefined());
    expect(screen.getByRole("status", { name: "Loading your weight history" })).toBeInTheDocument();
    expect(screen.queryByText("7-day average", { selector: ".lbl" })).toBeNull();
    await act(async () => release([GOAL]));
    expect(await screen.findByText("7-day average", { selector: ".lbl" })).toBeInTheDocument();
  });

  it("says when the goal could not be loaded", async () => {
    mockApi({ goals: new ApiError(500, "boom") });
    renderPage();
    expect(await screen.findByText("Couldn't load your goal")).toBeInTheDocument();
  });

  // Review focus 1: offline, with weigh-ins saved and goals never loaded.
  it("draws without the goal while offline with none saved, rather than spinning", async () => {
    mockApi();
    renderPage({ seed: HISTORY, offline: true });
    expect(await screen.findByText("Couldn't load your goal")).toBeInTheDocument();
    expect(screen.getByText("7-day average", { selector: ".lbl" })).toBeInTheDocument();
  });

  // Final review: once drawn without the goals, the signal returning starts
  // their fetch (pending again). Spinning then would unmount an open sheet and
  // lose what was being typed, so the page waits for the goals only once.
  it("stays drawn, with an open sheet, when the signal returns and the goals start loading", async () => {
    let release!: (goals: Goal[]) => void;
    mockApi({ goals: new Promise<Goal[]>((r) => (release = r)) });
    const qc = renderPage({ seed: HISTORY, offline: true });
    expect(await screen.findByText("Couldn't load your goal")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    const field = screen.getByLabelText("Weight (kg)");
    await userEvent.clear(field);
    await userEvent.type(field, "79.6");

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(qc.getQueryState(["goals", "u1"])?.fetchStatus).toBe("fetching"));
    await act(async () => {}); // let the page re-render on that state
    expect(screen.queryByRole("status", { name: "Loading your weight history" })).toBeNull();
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(79.6);

    await act(async () => release([GOAL]));
    expect(await screen.findByText(/^Goal 78 kg ·/)).toBeInTheDocument();
  });

  it("lists weeks for 3M and months for 6M", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByText("Weeks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^This week/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "6M" }));
    expect(screen.getByText("Months")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^This month/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a week onto its weigh-ins, and a weigh-in onto the sheet", async () => {
    const { calls } = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^This week/ }));
    await userEvent.click(screen.getByText("80.0 kg"));
    expect(screen.getByRole("dialog", { name: /^Edit / })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/weight/w-2026-10-14")).toBe(true));
  });

  it("closes an open week when the range changes", async () => {
    mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^This week/ }));
    expect(screen.getByText("80.0 kg")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(screen.queryByText("80.0 kg")).toBeNull();
  });

  it("logs from the Log button against today", async () => {
    const { calls } = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Log" }));
    expect(screen.getByRole("dialog", { name: "Log weight" })).toBeInTheDocument();
    const field = screen.getByLabelText("Weight (kg)");
    await userEvent.clear(field);
    await userEvent.type(field, "79.6");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({ date: TODAY, weight_kg: 79.6, notes: null }),
    );
  });

  it("says so, with no range, when there are no weigh-ins", async () => {
    mockApi({ weights: [] });
    renderPage();
    expect(await screen.findByText("No weigh-ins yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3M" })).toBeNull();
  });
});

// Deferred from #31: the same defect as Home's, on the Weight page.
describe("Weight page, when loading fails", () => {
  it("keeps your history when a refresh fails", async () => {
    const { state } = mockApi();
    const qc = renderPage();
    expect(await screen.findByText("7-day average", { selector: ".lbl" })).toBeInTheDocument();

    state.weights = new ApiError(500, "boom");
    await act(() => qc.refetchQueries({ queryKey: ["weight"] }));
    await waitFor(() => expect(qc.getQueryState(["weight", "u1"])?.status).toBe("error"));

    expect(screen.queryByText("Could not load")).toBeNull();
    expect(screen.getByText("7-day average", { selector: ".lbl" })).toBeInTheDocument();
  });

  it("says so when there is nothing to show", async () => {
    mockApi({ weights: new ApiError(500, "boom") });
    renderPage();
    expect(await screen.findByText("Could not load")).toBeInTheDocument();
  });
});
