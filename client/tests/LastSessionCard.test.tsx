import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkoutSession, WorkoutSet } from "@dashboard/shared";
import { LastSessionCard } from "../src/features/home/LastSessionCard";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const session: WorkoutSession = {
  id: "s1", user_id: "u1", date: "2026-08-24", day_type: 2, day_name: "Pull", notes: null, created_at: "",
};
const set = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: "x", user_id: "u1", session_id: "s1", exercise_name: "Reverse Curl", set_number: 1,
  weight_kg: 12.5, reps: 4, reps_left: null, reps_right: null, is_bodyweight: false, ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("LastSessionCard", () => {
  // Spec §1, accepted by the user: summaries show the reps that count, and
  // only the places that list the sets themselves show both sides.
  it("shows the counted reps for a single-sided best set, not the sides", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/session-detail")) {
        return { sets: [set({ reps_left: 4, reps_right: 5 })], cardio: [] } as never;
      }
      throw new Error(`unexpected ${path}`);
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <LastSessionCard session={session} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("12.5×4")).toBeInTheDocument();
    expect(screen.queryByText(/L4 R5/)).toBeNull();
  });
});
