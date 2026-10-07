import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { GymPage } from "../src/features/gym/GymPage";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

// 2026-08-25 is a Tuesday: DEFAULT_SPLIT's Pull (day_type 2).
const TUE = "2026-08-25";
function freeze() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 25, 12));
}

/** By path, longest prefix first (CLAUDE.md). */
const ROUTES: [string, unknown][] = [
  ["/api/split", DEFAULT_SPLIT],
  ["/api/exercises", [{ id: "e1", user_id: "u1", day_type: 2, exercise_name: "Row & Press", sort_order: 1 }]],
  ["/api/workouts/session-detail", { sets: [], cardio: [] }],
  ["/api/workouts/sessions", []],
  ["/api/workouts/session", null],
  ["/api/workouts/sets", []],
  ["/api/workouts/last-times", {}],
  ["/api/workouts/day-names", []],
  ["/api/workouts/exercise-names", []],
  ["/api/cardio", []],
];

function mockByPath() {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    const hit = ROUTES.find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return hit[1] as never;
  });
  return calls;
}

/** `gymDay` is what Home's Start/Continue link carries. */
function renderPage(gymDay?: number) {
  const qc = createQueryClient();
  const def = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...def, queries: { ...def.queries, retry: false } });
  render(
    <MemoryRouter initialEntries={[{ pathname: "/gym", state: gymDay === undefined ? null : { gymDay } }]}>
      <QueryClientProvider client={qc}>
        <GymPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return qc;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Gym's header (redesign part 3a, §2)", () => {
  it("shows the date as the eyebrow and the day as the title", async () => {
    freeze();
    mockByPath();
    renderPage();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Pull");
    expect(screen.getByLabelText(/change date/i)).toHaveValue(TUE);
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull();
  });

  // Final review, important 3: on a swapped day Home names the day trained, so
  // its button must open that day rather than the scheduled one.
  it("opens on the day Home's button sent it to", async () => {
    freeze();
    mockByPath();
    renderPage(1);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Legs"));
    expect(screen.getByLabelText(/change date/i)).toHaveValue(TUE);
  });

  it("offers Back to today only on another date, and it returns to today", async () => {
    freeze();
    mockByPath();
    renderPage();
    fireEvent.change(await screen.findByLabelText(/change date/i), { target: { value: "2026-05-20" } });
    await userEvent.click(await screen.findByRole("button", { name: "Back to today" }));
    expect(screen.getByLabelText(/change date/i)).toHaveValue(TUE);
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull();
  });

  it("switches day from the sheet behind the title", async () => {
    freeze();
    mockByPath();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Training day/ }));
    const sheet = screen.getByRole("dialog", { name: "Training day" });
    expect(within(sheet).getByRole("button", { name: "Pull" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(sheet).getByRole("button", { name: "Legs" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Legs");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Training day" })).toBeNull());
  });

  // Deferred from #32: Add before today's sets loaded overwrote set 1.
  it("won't log a set while today's sets are still loading", async () => {
    freeze();
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/session?")) return new Promise(() => {}) as never;
      const hit = ROUTES.find(([p]) => path.startsWith(p));
      if (!hit) throw new Error(`unmocked path: ${path}`);
      return hit[1] as never;
    });
    renderPage();
    await userEvent.click(await screen.findByText("Row & Press"));
    const sheet = within(await screen.findByRole("dialog", { name: "Row & Press" }));
    await userEvent.type(sheet.getByLabelText(/weight/i), "90");
    await userEvent.type(sheet.getByLabelText(/reps/i), "6");
    expect(sheet.getByRole("button", { name: "Add set" })).toBeDisabled();
  });

  // Final review, important 1: a FAILED load left the sheet sure there were no
  // sets, so Add set 1 was back, and sent once the signal returned.
  it("won't log a set when today's sets failed to load, and says why", async () => {
    freeze();
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/session?")) throw new ApiError(500, "boom");
      const hit = ROUTES.find(([p]) => path.startsWith(p));
      if (!hit) throw new Error(`unmocked path: ${path}`);
      return hit[1] as never;
    });
    renderPage();
    await userEvent.click(await screen.findByText("Row & Press"));
    const sheet = within(await screen.findByRole("dialog", { name: "Row & Press" }));
    expect(await sheet.findByText("Couldn't load today's sets.")).toBeInTheDocument();
    await userEvent.type(sheet.getByLabelText(/weight/i), "90");
    await userEvent.type(sheet.getByLabelText(/reps/i), "6");
    expect(sheet.getByRole("button", { name: "Add set" })).toBeDisabled();
  });

  // Review focus 3: logging on a past date compares against the days before IT.
  it("asks for last time before the date being logged", async () => {
    freeze();
    const calls = mockByPath();
    renderPage();
    await screen.findByText("Row & Press");
    expect(calls).toContain(`/api/workouts/last-times?before=${TUE}&name=Row%20%26%20Press`);
    fireEvent.change(screen.getByLabelText(/change date/i), { target: { value: "2026-05-20" } });
    await waitFor(() => expect(calls).toContain("/api/workouts/last-times?before=2026-05-20&name=Row%20%26%20Press"));
  });
});

// Deferred from #31: useSplit falls back to DEFAULT_SPLIT, so a split that failed
// with nothing cached named the default split's day, and logged against it.
describe("Gym, when the split fails to load", () => {
  /** ROUTES, with the split and the last logged day answered by the test. */
  function mockSplit(split: () => unknown, sessions: unknown[] = []) {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/split")) return split() as never;
      if (path.startsWith("/api/workouts/sessions")) return sessions as never;
      const hit = ROUTES.find(([p]) => path.startsWith(p));
      if (!hit) throw new Error(`unmocked path: ${path}`);
      return hit[1] as never;
    });
  }

  it("says so, and names no day", async () => {
    freeze();
    vi.mocked(toast.error).mockClear();
    mockSplit(() => { throw new ApiError(500, "boom"); });
    renderPage();
    expect(await screen.findByText("Couldn't load your split.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    // One failure, one message: the page's line, not a toast as well.
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Thursday is DEFAULT_SPLIT's rest day, where falling back to the last logged
  // day latches: decided from the default, the real split could not undo it.
  it("decides the day from the real split when it arrives after a failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 27, 12)); // Thu
    const thursdayIsPush = { ...DEFAULT_SPLIT, week: [3, 2, 1, 3, 5, 4, "rest"] };
    let down = true;
    mockSplit(
      () => { if (down) throw new ApiError(500, "boom"); return thursdayIsPush; },
      [{ id: "s0", user_id: "u1", date: "2026-08-24", day_type: 5, day_name: "Upper", notes: null, created_at: "", lifts: 1, sets: 1 }],
    );
    const qc = renderPage();
    await screen.findByText("Couldn't load your split.");
    down = false;
    await act(() => qc.refetchQueries({ queryKey: ["split"] }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Push");
  });
});
