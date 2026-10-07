import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { NutritionPage } from "../src/features/nutrition/NutritionPage";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { createQueryClient } from "../src/lib/queryClient";
import type { DayTotal, FoodLogEntry, NutritionTarget, RecentFood } from "@dashboard/shared";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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
  days?: (from: string, to: string) => DayTotal[];
  recents?: RecentFood[];
}

/** By method and path, longest prefix first - never by call order. */
function mockApi(o: Opts = {}) {
  const calls: { key: string; init?: RequestInit }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, init });
    const q = new URL(path, "http://x").searchParams;
    if (key.startsWith("GET /api/nutrition/targets")) return (o.targets ? o.targets() : [cut]) as never;
    if (key.startsWith("GET /api/nutrition/diary")) return (o.diary ? o.diary(q.get("date")!) : []) as never;
    if (key.startsWith("GET /api/nutrition/days")) return (o.days ? o.days(q.get("from")!, q.get("to")!) : []) as never;
    if (key.startsWith("POST /api/nutrition/diary")) return e({ id: "new" }) as never;
    if (key.startsWith("GET /api/nutrition/recents")) return (o.recents ?? []) as never;
    if (key.startsWith("GET /api/nutrition/tdee")) return { formula: null, adaptive: null, days_logged: 0 } as never;
    if (key.startsWith("GET /api/profile")) return {} as never;
    throw new Error(`unexpected ${key}`);
  });
  return calls;
}
const asked = (calls: { key: string }[], key: string) => calls.some((c) => c.key === key);

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <NutritionPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The day's figure, e.g. "762 kcal left". */
async function findFigure(text: string) {
  await waitFor(() => expect(screen.getByText(/^kcal (left|over|eaten)$/).parentElement).toHaveTextContent(text));
}
const bar = (name: RegExp) => screen.getByRole("button", { name });

/** What a phone does on waking an app left open: the clock has moved, and the page becomes visible. */
function wakeAt(date: Date) {
  vi.setSystemTime(date);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// 2026-09-23 is a Wednesday.
describe("NutritionPage", () => {
  // The CLAUDE.md rule: a derived value must wait for everything it derives from.
  it("paints no summary while the targets are pending, even with the day loaded", async () => {
    freeze("2026-09-23");
    const calls = mockApi({ targets: () => new Promise(() => {}), diary: () => [e({})] });
    renderPage();
    // Wait until the DIARY has been answered, so a spinner still showing is down
    // to the targets alone.
    await waitFor(() => expect(calls.some((c) => c.key.startsWith("GET /api/nutrition/diary"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("status", { name: "Loading your day" })).toBeInTheDocument();
    expect(screen.queryByText(/kcal eaten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it("shows kcal left once both have loaded", async () => {
    freeze("2026-09-23");
    mockApi({ diary: () => [e({})] });
    renderPage();
    await findFigure("762 kcal left");
  });

  // Review focus 2 (#17).
  it("reads a day with no label data as unknown, not zero", async () => {
    freeze("2026-09-23");
    mockApi({ diary: () => [e({}), e({ id: "e2" })] });
    renderPage();
    await findFigure("878 kcal over");
    expect(within(screen.getByRole("group", { name: "Fibre, sugar, sat fat and salt" })).getAllByText("—")).toHaveLength(4);
  });
});

describe("NutritionPage, the last 7 days (redesign part 4)", () => {
  it("shows the 7 days ending today, with today open", async () => {
    freeze("2026-09-23");
    const calls = mockApi({ days: () => [{ date: "2026-09-22", calories: 2979, protein_g: 131 }] });
    renderPage();
    const strip = within(await screen.findByRole("group", { name: "Last 7 days" }));
    expect(strip.getAllByRole("button")).toHaveLength(7);
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: /^Tuesday 22 September: 2,979 kcal, 577 over target/ })).toBeInTheDocument();
    expect(asked(calls, "GET /api/nutrition/days?from=2026-09-17&to=2026-09-23")).toBe(true);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Food");
  });

  it("opens a day from the strip without moving it", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Tuesday 22 September/ }));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-22")).toBe(true));
    expect(bar(/^Tuesday 22 September/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Last 7 days" })).toBeInTheDocument();
    expect(calls.filter((c) => c.key.startsWith("GET /api/nutrition/days")).every((c) => c.key.endsWith("to=2026-09-23"))).toBe(true);
  });

  // Review focus 5 (#17): logging on a past day lands on that day.
  it("adds to the day being viewed, not today", async () => {
    freeze("2026-09-23");
    const calls = mockApi({
      recents: [{ entry: e({ id: "r1", name: "Banana", quantity: 1, unit: "serving", calories: 105 }), item: null }],
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Tuesday 22 September/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Add food/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Recent" }));
    await userEvent.click(await screen.findByText("Banana"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      const post = calls.find((c) => c.key === "POST /api/nutrition/diary");
      expect(JSON.parse(String(post!.init!.body)).date).toBe("2026-09-22");
    });
  });

  it("redraws the strip after adding food", async () => {
    freeze("2026-09-23");
    const calls = mockApi({
      recents: [{ entry: e({ id: "r1", name: "Banana", quantity: 1, unit: "serving", calories: 105 }), item: null }],
    });
    renderPage();
    await screen.findByRole("group", { name: "Last 7 days" });
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/days?from=2026-09-17&to=2026-09-23")).toBe(true));
    const before = calls.filter((c) => c.key.startsWith("GET /api/nutrition/days")).length;
    await userEvent.click(await screen.findByRole("button", { name: /Add food/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Recent" }));
    await userEvent.click(await screen.findByText("Banana"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls.filter((c) => c.key.startsWith("GET /api/nutrition/days")).length).toBeGreaterThan(before));
  });

  it("opens the previous week's last day with ‹, and › comes back and stops at today", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    expect(await screen.findByRole("button", { name: "Next week" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByRole("group", { name: "10–16 Sep" })).toBeInTheDocument();
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/days?from=2026-09-10&to=2026-09-16")).toBe(true));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-16")).toBe(true));
    expect(bar(/^Wednesday 16 September/)).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(await screen.findByRole("group", { name: "Last 7 days" })).toBeInTheDocument();
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("stops › at today from a week that doesn't line up with it", async () => {
    freeze("2026-09-23");
    mockApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText(/change date/i), { target: { value: "2026-09-14" } });
    expect(await screen.findByRole("group", { name: "8–14 Sep" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(await screen.findByRole("group", { name: "15–21 Sep" })).toBeInTheDocument();
    // 21 + 7 is the 28th, past today: › lands on today instead.
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(await screen.findByRole("group", { name: "Last 7 days" })).toBeInTheDocument();
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
  });

  it("moves the strip to end on an older date picked, and Back to today returns", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText(/change date/i), { target: { value: "2026-09-01" } });
    expect(await screen.findByRole("group", { name: "26 Aug – 1 Sep" })).toBeInTheDocument();
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/days?from=2026-08-26&to=2026-09-01")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByRole("group", { name: "Last 7 days" })).toBeInTheDocument();
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the strip where it is when a date inside it is picked", async () => {
    freeze("2026-09-23");
    mockApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText(/change date/i), { target: { value: "2026-09-20" } });
    expect(await screen.findByRole("button", { name: /^Sunday 20 September/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Last 7 days" })).toBeInTheDocument();
  });

  // Review focus 3: typing gets past the picker's max.
  it("ignores a future date typed into the picker", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText(/change date/i), { target: { value: "2026-09-30" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-30")).toBe(false);
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
  });

  // Final review: "10000-…" passed the future-date guard ("1" < "2" as strings)
  // and crashed the strip's render; "0002-…" opened a strip in 1902.
  it("ignores a typed date that isn't a real date with a four-digit year", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    const input = await screen.findByLabelText(/change date/i);
    fireEvent.change(input, { target: { value: "10000-09-20" } });
    fireEvent.change(input, { target: { value: "0002-09-20" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true");
    expect(calls.some((c) => /1902|0002|10000/.test(c.key))).toBe(false);
  });

  it("keeps the day working when the week fails, with one message", async () => {
    freeze("2026-09-23");
    mockApi({
      diary: () => [e({})],
      days: () => {
        throw new ApiError(500, "boom");
      },
    });
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    renderPage(client);
    expect(await screen.findByText("Couldn't load the week.")).toBeInTheDocument();
    await findFigure("762 kcal left");
    expect(toast.error).not.toHaveBeenCalled();
  });

  // An app left open overnight must not log breakfast to yesterday.
  it("moves on to the new day when the app wakes after midnight", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    await screen.findByRole("button", { name: /Add food/ });

    wakeAt(new Date(2026, 8, 24, 7));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-24")).toBe(true));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/days?from=2026-09-18&to=2026-09-24")).toBe(true));
    expect(screen.getByLabelText(/change date/i)).toHaveValue("2026-09-24");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  // Browser pass: the eyebrow read its own clock, so for up to a minute after
  // midnight Back to today asked for a day the page still called tomorrow, and
  // the future-date guard ignored it.
  it("goes back to today even before the page has noticed midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 23, 59, 30));
    mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Tuesday 22 September/ }));
    // No visibility event or minute tick yet: the page's today is still the 23rd.
    vi.setSystemTime(new Date(2026, 8, 24, 0, 0, 10));
    // Any re-render after midnight, as the browser pass had: the eyebrow reads the 24th.
    await userEvent.click(bar(/^Monday 21 September/));
    await userEvent.click(screen.getByRole("button", { name: "Back to today" }));
    await waitFor(() => expect(bar(/^Wednesday 23 September/)).toHaveAttribute("aria-pressed", "true"));
  });

  // Spec §3: back on today, with the strip ending today, IS following the clock.
  it("keeps following the clock after Back to today", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Tuesday 22 September/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back to today" }));

    wakeAt(new Date(2026, 8, 24, 7));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-24")).toBe(true));
    expect(screen.getByLabelText(/change date/i)).toHaveValue("2026-09-24");
  });

  // The complement: a day the user chose is theirs, and waking does not move it.
  it("stays on a past day the user picked", async () => {
    freeze("2026-09-23");
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Tuesday 22 September/ }));
    await waitFor(() => expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-22")).toBe(true));

    wakeAt(new Date(2026, 8, 24, 7));
    await new Promise((r) => setTimeout(r, 50));
    expect(asked(calls, "GET /api/nutrition/diary?date=2026-09-24")).toBe(false);
    expect(bar(/^Tuesday 22 September/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NutritionPage errors", () => {
  /** The real client - its QueryCache owns the toast - without the retry delay. */
  function realClient() {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
    return client;
  }

  it("shows one message for a failed first load, and retries from it", async () => {
    freeze("2026-09-23");
    let fail = true;
    mockApi({
      diary: () => {
        if (fail) throw new ApiError(500, "Server error");
        return [e({})];
      },
    });
    renderPage(realClient());

    expect(await screen.findByText("Could not load")).toBeInTheDocument();
    // The card is the message; a toast as well would report one failure twice.
    expect(toast.error).not.toHaveBeenCalled();

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await findFigure("762 kcal left");
  });

  // A refetch that fails must not take away a day that is already on screen.
  it("keeps the loaded day when a refresh fails", async () => {
    freeze("2026-09-23");
    let fail = false;
    mockApi({
      diary: () => {
        if (fail) throw new ApiError(500, "Server error");
        return [e({})];
      },
    });
    const client = realClient();
    renderPage(client);
    await findFigure("762 kcal left");

    fail = true;
    await act(() => client.refetchQueries({ queryKey: ["diary"] }));
    expect(await screen.findByText(/Couldn't refresh/)).toBeInTheDocument();
    await findFigure("762 kcal left");
    expect(screen.queryByText("Could not load")).not.toBeInTheDocument();
  });
});
