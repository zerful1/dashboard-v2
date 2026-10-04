import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { shiftISO, toLocalISO, type HabitSummary } from "@dashboard/shared";
import { createQueryClient } from "../src/lib/queryClient";
import { TodayHabitsCard } from "../src/features/habits/TodayHabitsCard";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const today = toLocalISO();
const habit = (over: Partial<HabitSummary>): HabitSummary => ({
  id: "h1", user_id: "u1", name: "Skincare", emoji: "🫧", sort_order: 1, created_at: "", streak: 0, recent: [], ...over,
});

/** By method and path. `lists` answers the GETs in turn; the last one repeats. */
function mockApi(lists: (() => Promise<HabitSummary[]>)[], write: () => Promise<unknown> = async () => undefined) {
  const calls: string[] = [];
  let n = 0;
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push(key);
    if (key.startsWith("GET /api/habits")) return (await lists[Math.min(n++, lists.length - 1)]!()) as never;
    if (key.startsWith("PUT /api/habits/") || key.startsWith("DELETE /api/habits/")) return (await write()) as never;
    throw new Error(`unexpected ${key}`);
  });
  return calls;
}

/** The app's client (it carries the offline rule), without the query retry. */
function client(): QueryClient {
  const qc = createQueryClient();
  const d = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...d, queries: { ...d.queries, retry: false } });
  return qc;
}

function renderCard(qc = client()) {
  return { qc, ...render(<QueryClientProvider client={qc}><TodayHabitsCard /></QueryClientProvider>) };
}

afterEach(() => vi.restoreAllMocks());

describe("TodayHabitsCard", () => {
  it("lists today's habits with their streaks", async () => {
    mockApi([async () => [
      habit({ streak: 3, recent: [shiftISO(today, -1)] }),
      habit({ id: "h2", name: "Put on retainer", emoji: null, sort_order: 2 }),
    ]]);
    renderCard();
    expect(await screen.findByText("3-day streak")).toBeInTheDocument();
    expect(screen.getByText("Today's habits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Skincare done" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Mark Put on retainer done" })).toBeInTheDocument();
  });

  it("marks today done at once, before the server answers", async () => {
    const calls = mockApi([async () => [habit({ streak: 2, recent: [shiftISO(today, -1)] })]], () => new Promise(() => {}));
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Mark Skincare done" }));
    expect(await screen.findByRole("button", { name: "Mark Skincare not done" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(calls).toContain(`PUT /api/habits/h1/days/${today}`);
  });

  // Review focus 3: the refetch after the failure never answers, so only the
  // rollback can put the tick back.
  it("puts the tick back when saving fails", async () => {
    mockApi(
      [async () => [habit({})], () => new Promise(() => {})],
      async () => {
        throw new ApiError(500, "boom");
      },
    );
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Mark Skincare done" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark Skincare done" })).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("isn't shown to someone with no habits", async () => {
    mockApi([async () => []]);
    const { qc, container } = renderCard();
    await waitFor(() => expect(qc.getQueryCache().findAll({ queryKey: ["habits"] })[0]?.state.status).toBe("success"));
    expect(container).toBeEmptyDOMElement();
  });

  // Characterisation: pending and "no habits" both render nothing today. This
  // keeps them that way if the empty case ever grows a prompt.
  it("renders nothing while loading", async () => {
    const calls = mockApi([() => new Promise(() => {})]);
    const { container } = renderCard();
    await waitFor(() => expect(calls).toContain(`GET /api/habits?today=${today}`));
    expect(container).toBeEmptyDOMElement();
  });

  it("says so when the habits can't load, and offers a retry", async () => {
    mockApi([async () => {
      throw new ApiError(500, "boom");
    }]);
    renderCard();
    expect(await screen.findByText(/Couldn't load your habits/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
