import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomePage } from "../src/pages/HomePage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import type { Profile, WorkoutSession } from "@dashboard/shared";

const PROFILE: Profile = {
  user_id: "1",
  display_name: "Alice",
  avatar_path: null,
  units: "kg",
  timezone: "Europe/London",
  updated_at: "2026-08-15T00:00:00.000Z",
  height_cm: null,
  birth_year: null,
  sex: null,
  activity_level: null,
};

// DEFAULT_SPLIT.week is [3,2,1,'rest',5,4,'rest'] Monday-first, and its days are
// 1=Legs 2=Pull 3=Push 4=Lower 5=Upper. So Wednesday is Legs and Thursday rests.
const WED = "2026-08-26";
const THU = "2026-08-27";

/** Local noon, so the local calendar day is unambiguous in any timezone. */
function freeze(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y!, m! - 1, d!, 12));
}

const session = (
  date: string,
  dayType: number,
  dayName: string,
  id = `s-${date}`,
): WorkoutSession => ({
  id,
  user_id: "1",
  date,
  day_type: dayType,
  day_name: dayName,
  notes: null,
  created_at: "",
});

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

interface Overrides {
  profile?: () => Promise<Profile>;
  /** Leave /api/split hanging, so the split query stays pending. */
  splitNeverResolves?: boolean;
  sessions?: WorkoutSession[];
  sets?: unknown[];
  weights?: unknown[];
}

/**
 * Mocks by PATH, never by call order. Home fires five requests with no
 * serialisation between them — profile, split, weight, sessions and the last
 * session's detail — so an order-based mock here would be a race.
 *
 * Ordered longest-prefix-first: `/api/workouts/session-detail` is listed before
 * `/api/workouts/sessions` so a shorter shared prefix can never swallow it.
 */
function mockApi(o: Overrides = {}) {
  const routes: [string, () => unknown][] = [
    ["/api/auth/me", () => ({ id: "1", email: "you@example.com" })],
    ["/api/profile", () => (o.profile ? o.profile() : PROFILE)],
    ["/api/split", () => (o.splitNeverResolves ? new Promise(() => {}) : DEFAULT_SPLIT)],
    ["/api/workouts/session-detail", () => ({ sets: o.sets ?? [], cardio: [] })],
    ["/api/workouts/sessions", () => o.sessions ?? []],
    ["/api/weight", () => o.weights ?? []],
  ];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = routes.find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unexpected ${path}`);
    return hit[1]() as never;
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HomePage heading", () => {
  it("shows the display name once the profile loads", async () => {
    mockApi();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alice"),
    );
  });

  // The case that makes `||` the right operator rather than `??`. display_name
  // is `NOT NULL DEFAULT ''`, so every freshly registered user has one — and an
  // empty string is present, not nullish. Written with `??` this renders a
  // blank heading, which is silent: nothing errors, the page just looks broken
  // for exactly the users seeing it for the first time.
  it("falls back to the email when display_name is empty", async () => {
    mockApi({ profile: async () => ({ ...PROFILE, display_name: "" }) });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("you@example.com"),
    );
  });

  it("falls back to the email when the profile request fails", async () => {
    mockApi({
      profile: async () => {
        throw new ApiError(503, "Service Unavailable");
      },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("you@example.com"),
    );
    // A failure here degrades rather than announcing itself — the heading is
    // still correct, so there is nothing for the user to act on.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("HomePage overview", () => {
  it("shows no overview at all until the data has arrived", async () => {
    // The defect this guards, found by four tests failing for the right reason.
    // While auth is resolving these queries are DISABLED, and a disabled query
    // reports isLoading false — so Home rendered a complete, confident overview
    // built from DEFAULT_SPLIT and zero sessions, then replaced it with the
    // spinner, then with the truth. On a slow connection that first paint is a
    // visible lie: it can name the wrong day, or claim a rest day.
    freeze(WED);
    mockApi({ sessions: [session(WED, 1, "Legs")] });
    renderPage();

    // Synchronously after mount: the spinner, and nothing derived.
    expect(screen.getByLabelText(/loading your overview/i)).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
    expect(screen.queryByText(/not started/i)).toBeNull();

    // And only then the real thing.
    expect(await screen.findByRole("link", { name: /^continue$/i })).toBeInTheDocument();
  });

  it("waits for the SPLIT before naming a day", async () => {
    // The trap that persistence activates. useSplit returns `data ?? DEFAULT_SPLIT`,
    // so an unloaded split is indistinguishable from a default one. Today the
    // sessions query happens to cover it, but a persisted-hydrated sessions query
    // reports success — and isPending false — while still disabled. Without
    // splitPending in the gate, Home names the day from DEFAULT_SPLIT, which on a
    // customised split is the WRONG day rather than a harmless one.
    freeze(WED);
    mockApi({ sessions: [session(WED, 1, "Legs")], splitNeverResolves: true });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alice"),
    );
    // Let sessions and weight actually settle. Asserting straight after the
    // heading passes even WITHOUT the fix, because the profile resolves first
    // and the spinner is still up for an unrelated reason — a guard that holds
    // either way is no guard.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByLabelText(/loading your overview/i)).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
    expect(screen.queryByRole("link", { name: /^continue$/i })).toBeNull();
  });

  it("names today's training day from the split", async () => {
    freeze(WED);
    mockApi();
    renderPage();
    expect(await screen.findByText("Legs")).toBeInTheDocument();
  });

  it("offers no action on a rest day", async () => {
    freeze(THU);
    mockApi();
    renderPage();

    expect(await screen.findByText("Rest day")).toBeInTheDocument();
    // A rest day is not a task. A button here would invent one.
    expect(screen.queryByRole("link", { name: /^log$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^continue$/i })).toBeNull();
  });

  it("reads Log when today has not been started", async () => {
    freeze(WED);
    mockApi();
    renderPage();
    expect(await screen.findByRole("link", { name: /^log$/i })).toBeInTheDocument();
  });

  it("reads Continue once today has a session", async () => {
    freeze(WED);
    mockApi({ sessions: [session(WED, 1, "Legs")] });
    renderPage();
    expect(await screen.findByRole("link", { name: /^continue$/i })).toBeInTheDocument();
  });

  it("renders the week count as logged / target", async () => {
    freeze(WED);
    // Mon and Tue of this week; DEFAULT_SPLIT has five training days.
    mockApi({
      sessions: [session("2026-08-25", 2, "Pull"), session("2026-08-24", 3, "Push")],
    });
    renderPage();
    expect(await screen.findByText(/2 of 5 sessions logged this week/i)).toBeInTheDocument();
  });

  it("renders the session's SNAPSHOTTED day_name, not the split's current label", async () => {
    freeze(WED);
    // day_type 5 is 'Upper' in DEFAULT_SPLIT today, but this session was logged
    // under a retired split that called it 'Upper A'. Resolving the name would
    // silently relabel history whenever the split is edited.
    mockApi({ sessions: [session("2026-08-21", 5, "Upper A")] });
    renderPage();

    expect(await screen.findByText(/Upper A/)).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been logged", async () => {
    freeze(WED);
    mockApi({ sessions: [] });
    renderPage();
    expect(await screen.findByText(/no sessions yet/i)).toBeInTheDocument();
  });
});
