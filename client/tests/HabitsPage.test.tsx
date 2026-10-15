import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { shiftISO, toLocalISO, type HabitSummary } from "@dashboard/shared";
import { createQueryClient } from "../src/lib/queryClient";
import { HabitsPage } from "../src/features/habits/HabitsPage";
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

/** By method and path; every write answers at once. */
function mockApi(list: () => Promise<HabitSummary[]>, add?: () => Promise<unknown>) {
  const calls: { key: string; body?: unknown }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (key.startsWith("GET /api/habits")) return (await list()) as never;
    if (key === "POST /api/habits") return (add ? await add() : habit({ id: "new" })) as never;
    if (key.startsWith("POST /api/habits/reorder")) return undefined as never;
    if (/^(PUT|DELETE|PATCH) \/api\/habits\//.test(key)) return undefined as never;
    throw new Error(`unexpected ${key}`);
  });
  return calls;
}

function client(): QueryClient {
  const qc = createQueryClient();
  const d = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...d, queries: { ...d.queries, retry: false } });
  return qc;
}
const renderPage = () => render(<QueryClientProvider client={client()}><HabitsPage /></QueryClientProvider>);
const keys = (calls: { key: string }[]) => calls.map((c) => c.key);

afterEach(() => vi.restoreAllMocks());

describe("HabitsPage", () => {
  // Redesign part 7: a plain title, as on Weight and Insights.
  it("is headed Habits", async () => {
    mockApi(async () => [habit({})]);
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    expect(screen.queryByText("Daily habits")).toBeNull();
  });

  it("lists the habits as rows, while editing too", async () => {
    mockApi(async () => [habit({}), habit({ id: "h2", name: "Put on retainer", sort_order: 2 })]);
    renderPage();
    const rows = async () => within(await screen.findByRole("list", { name: "Your habits" })).getAllByRole("listitem");
    expect(await rows()).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await rows()).toHaveLength(2);
  });

  it("toggles a day in the strip: PUT when it wasn't done, DELETE when it was", async () => {
    const yesterday = shiftISO(today, -1);
    const calls = mockApi(async () => [habit({ recent: [yesterday] })]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: `Skincare on ${today}` }));
    await userEvent.click(screen.getByRole("button", { name: `Skincare on ${yesterday}` }));
    await waitFor(() => expect(keys(calls)).toContain(`PUT /api/habits/h1/days/${today}`));
    expect(keys(calls)).toContain(`DELETE /api/habits/h1/days/${yesterday}`);
  });

  it("offers a first habit when there are none, and sends the name trimmed", async () => {
    const calls = mockApi(async () => []);
    renderPage();
    expect(await screen.findByText("Your first habit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Habit name" }), "  Read  ");
    // Pasted, not typed: typing can split an emoji into its surrogate halves.
    await userEvent.click(screen.getByRole("textbox", { name: "Emoji (optional)" }));
    await userEvent.paste("📖");
    await userEvent.click(screen.getByRole("button", { name: "Add habit" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/habits")?.body).toEqual({ name: "Read", emoji: "📖" }));
  });

  it("asks before deleting, and deletes only on yes", async () => {
    const calls = mockApi(async () => [habit({})]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete Skincare" }));
    expect(confirm).toHaveBeenCalledWith("Delete Skincare and its history?");
    expect(keys(calls)).not.toContain("DELETE /api/habits/h1");
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete Skincare" }));
    await waitFor(() => expect(keys(calls)).toContain("DELETE /api/habits/h1"));
  });

  it("moves a habit and saves the whole order", async () => {
    const calls = mockApi(async () => [habit({}), habit({ id: "h2", name: "Put on retainer", sort_order: 2 })]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Put on retainer up" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /api/habits/reorder")?.body).toEqual({ ids: ["h2", "h1"] }),
    );
  });

  // Final review: Done unmounted the rows and dropped an unsaved rename.
  it("keeps a rename when Done is tapped", async () => {
    const calls = mockApi(async () => [habit({})]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Name for Skincare" });
    await userEvent.clear(field);
    await userEvent.type(field, "Skin care");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "PATCH /api/habits/h1")?.body).toEqual({ name: "Skin care", emoji: "🫧" }),
    );
  });

  it("saves a rename on Enter", async () => {
    const calls = mockApi(async () => [habit({})]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Name for Skincare" });
    await userEvent.clear(field);
    await userEvent.type(field, "Skin care{Enter}");
    await waitFor(() =>
      expect(calls.find((c) => c.key === "PATCH /api/habits/h1")?.body).toEqual({ name: "Skin care", emoji: "🫧" }),
    );
  });

  // Final review: a just-added habit has no server id yet, and every action on
  // it - or a reorder carrying its temporary id - failed with "Validation failed".
  it("holds a just-added habit's controls until the server has saved it", async () => {
    mockApi(async () => [], () => new Promise(() => {}));
    renderPage();
    await userEvent.type(await screen.findByRole("textbox", { name: "Habit name" }), "Read");
    await userEvent.click(screen.getByRole("button", { name: "Add habit" }));
    expect(await screen.findByRole("button", { name: `Read on ${today}` })).toBeDisabled();
  });

  it("doesn't reorder while a new habit is still saving", async () => {
    mockApi(async () => [habit({})], () => new Promise(() => {}));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Habit name" }), "Read");
    await userEvent.click(screen.getByRole("button", { name: "Add habit" }));
    expect(await screen.findByRole("button", { name: "Delete Read" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Skincare down" })).toBeDisabled();
  });

  it("stops offering the add form at 12", async () => {
    mockApi(async () => Array.from({ length: 12 }, (_, i) => habit({ id: `h${i}`, name: `Habit ${i}`, sort_order: i + 1 })));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByText("You can have up to 12 habits.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Habit name" })).toBeNull();
  });

  it("says so when habits can't load, with a retry", async () => {
    mockApi(async () => {
      throw new ApiError(500, "boom");
    });
    renderPage();
    expect(await screen.findByText("Couldn't load your habits.")).toHaveClass("text-negative");
    // An outline, as on Insights: retrying is not the screen's one white action.
    expect(screen.getByRole("button", { name: "Retry" })).toHaveClass("border-edge");
  });
});
