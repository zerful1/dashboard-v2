import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NutritionPage } from "../src/features/nutrition/NutritionPage";
import * as apiModule from "../src/lib/api";
import type { FoodLogEntry, NutritionTarget, RecentFood } from "@dashboard/shared";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/** Local noon, so the local calendar day is unambiguous in any timezone. */
function freeze(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, 12));
}

const cut: NutritionTarget = {
  id: "t", user_id: "u1", effective_from: "2026-06-09", goal_mode: "cut",
  calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210, created_at: "",
};
const e = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  id: "e1", user_id: "u1", date: "2026-09-23", logged_at: "2026-09-23T07:10:00.000Z", food_item_id: null,
  name: "Oats", quantity: 60, unit: "g", calories: 1640, protein_g: 100, fat_g: 40, carbs_g: 150,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, ...over,
});

interface Opts {
  targets?: () => unknown;
  diary?: (date: string) => FoodLogEntry[];
  recents?: RecentFood[];
}

/** By method and path, longest prefix first - never by call order. */
function mockApi(o: Opts = {}) {
  const calls: { key: string; init?: RequestInit }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, init });
    if (key.startsWith("GET /api/nutrition/targets")) return (o.targets ? o.targets() : [cut]) as never;
    if (key.startsWith("GET /api/nutrition/diary")) {
      const date = new URL(path, "http://x").searchParams.get("date")!;
      return (o.diary ? o.diary(date) : []) as never;
    }
    if (key.startsWith("POST /api/nutrition/diary")) return e({ id: "new" }) as never;
    if (key.startsWith("GET /api/nutrition/recents")) return (o.recents ?? []) as never;
    if (key.startsWith("GET /api/nutrition/tdee")) return { formula: null, adaptive: null, days_logged: 0 } as never;
    if (key.startsWith("GET /api/profile")) return {} as never;
    throw new Error(`unexpected ${key}`);
  });
  return calls;
}

function renderPage() {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NutritionPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NutritionPage", () => {
  // The CLAUDE.md rule: a derived value must wait for everything it derives from.
  it("paints no summary while the targets are pending, even with the day loaded", async () => {
    freeze("2026-09-23");
    const calls = mockApi({ targets: () => new Promise(() => {}), diary: () => [e({})] });
    renderPage();
    // Wait until the DIARY has been answered, so a spinner still showing is down
    // to the targets alone. Checking straight after render would pass on the
    // diary's own loading state and prove nothing about the targets.
    await waitFor(() => expect(calls.some((c) => c.key.startsWith("GET /api/nutrition/diary"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("status", { name: "Loading your day" })).toBeInTheDocument();
    // Without targets a rendered card would read "kcal eaten", not "left", so
    // both are checked: no summary of any kind.
    expect(screen.queryByText(/kcal eaten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("shows kcal left once both have loaded", async () => {
    freeze("2026-09-23");
    mockApi({ diary: () => [e({})] });
    renderPage();
    expect(await screen.findByText("762 left")).toBeInTheDocument();
  });

  // Review focus 2.
  it("reads a day with no label data as unknown, not zero", async () => {
    freeze("2026-09-23");
    mockApi({ diary: () => [e({}), e({ id: "e2" })] });
    renderPage();
    // Two 1640 kcal entries against 2402: the card reads "878 over" once loaded.
    await screen.findByText("878 over");
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("steps back a day, and cannot step past today", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    const next = await screen.findByRole("button", { name: "Next day" });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() =>
      expect(calls.some((c) => c.key === "GET /api/nutrition/diary?date=2026-09-22")).toBe(true),
    );
  });

  // Review focus 5: logging on a past day lands on that day.
  it("adds to the day being viewed, not today", async () => {
    freeze("2026-09-23");
    const calls = mockApi({
      recents: [{ entry: e({ id: "r1", name: "Banana", quantity: 1, unit: "serving", calories: 105 }), item: null }],
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Previous day" }));
    await userEvent.click(await screen.findByRole("button", { name: /Add food/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Recent" }));
    await userEvent.click(await screen.findByText("Banana"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      const post = calls.find((c) => c.key === "POST /api/nutrition/diary");
      expect(JSON.parse(String(post!.init!.body)).date).toBe("2026-09-22");
    });
  });
});
