import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoryTab } from "../src/features/gym/HistoryTab";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";

// Mutable so one test can render with NO user. vi.mock is hoisted above every
// import, so the state it reads has to be hoisted with it.
const auth = vi.hoisted(() => ({
  user: { id: "u1", email: "a@b.com" } as { id: string; email: string } | null,
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: auth.user, loading: false }),
}));

const session = (id: string, date: string, dayName: string) => ({
  id,
  user_id: "u1",
  date,
  day_type: 1,
  day_name: dayName,
  notes: null,
  created_at: "",
});

function mockByPath(routes: Record<string, unknown>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
    if (!hit) throw new Error(`unmocked path: ${path}`);
    return hit[1] as never;
  });
}

function renderTab(onEdit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <HistoryTab onEditInLog={onEdit} />
    </QueryClientProvider>,
  );
  return onEdit;
}

afterEach(() => {
  auth.user = { id: "u1", email: "a@b.com" };
  vi.restoreAllMocks();
});

describe("HistoryTab", () => {
  it("lists sessions", async () => {
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      "/api/workouts/day-names": ["Legs"],
      "/api/workouts/sessions": [session("a", "2026-08-16", "Legs")],
    });
    renderTab();
    expect(await screen.findByText("2026-08-16")).toBeInTheDocument();
  });

  it("shows Loading, not the empty state, while the query is disabled", async () => {
    // The plan suggested a request that never resolves - but an ENABLED query
    // that hangs has isLoading true as well, so that test passes either way.
    // The defect is a DISABLED query: while auth resolves, enabled is false,
    // isLoading is false, and the old guard rendered "No sessions logged yet"
    // over a list that simply had not been asked for yet.
    auth.user = null;
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      "/api/workouts/day-names": [],
      "/api/workouts/sessions": [],
    });
    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText(/no sessions logged yet/i)).toBeNull();
  });

  it("surfaces retired split names as chips without a hardcoded list", async () => {
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      // Upper A is not in DEFAULT_SPLIT but exists in history.
      "/api/workouts/day-names": ["Legs", "Upper A"],
      "/api/workouts/sessions": [],
    });
    renderTab();
    expect(await screen.findByRole("button", { name: "Upper A" })).toBeInTheDocument();
  });

  it("opens the detail sheet with a derived number of set columns", async () => {
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      "/api/workouts/day-names": ["Legs"],
      "/api/workouts/sessions": [session("a", "2026-08-16", "Legs")],
      "/api/workouts/session-detail": {
        sets: [1, 2, 3, 4, 5, 6].map((n) => ({
          id: `s${n}`,
          user_id: "u1",
          session_id: "a",
          exercise_name: "Squat",
          set_number: n,
          weight_kg: 100,
          reps: 5,
          is_bodyweight: false,
        })),
        cardio: [],
      },
    });
    renderTab();

    await userEvent.click(await screen.findByText("2026-08-16"));
    // Six sets means six columns; v1's fixed four would have hidden two.
    expect(await screen.findByRole("columnheader", { name: "6" })).toBeInTheDocument();
  });

  it("hands the session back for editing and closes", async () => {
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      "/api/workouts/day-names": ["Legs"],
      "/api/workouts/sessions": [session("a", "2026-08-16", "Legs")],
      "/api/workouts/session-detail": { sets: [], cardio: [] },
    });
    const onEdit = renderTab();

    await userEvent.click(await screen.findByText("2026-08-16"));
    await userEvent.click(await screen.findByRole("button", { name: /edit in log/i }));

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a", date: "2026-08-16", day_type: 1 }),
      ),
    );
  });

  it("leaves a gap where a set number is missing rather than shifting later sets left", async () => {
    // Set 2 was deleted, so the row is 1, —, 3. Rendering by position instead
    // of by set_number would show 1, 3 and silently relabel set 3 as set 2.
    mockByPath({
      "/api/split": DEFAULT_SPLIT,
      "/api/workouts/day-names": ["Legs"],
      "/api/workouts/sessions": [session("a", "2026-08-16", "Legs")],
      "/api/workouts/session-detail": {
        sets: [1, 3].map((n) => ({
          id: `s${n}`,
          user_id: "u1",
          session_id: "a",
          exercise_name: "Squat",
          set_number: n,
          weight_kg: 100,
          reps: n,
          is_bodyweight: false,
        })),
        cardio: [],
      },
    });
    renderTab();

    await userEvent.click(await screen.findByText("2026-08-16"));
    const row = (await screen.findByText("Squat")).closest("tr")!;
    const cells = [...row.querySelectorAll("td")].map((c) => c.textContent);
    expect(cells).toEqual(["Squat", "100×1", "—", "100×3"]);
  });
});
