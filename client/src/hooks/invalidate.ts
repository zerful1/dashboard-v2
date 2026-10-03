import type { QueryClient } from "@tanstack/react-query";

/**
 * Every query that reads workout_sessions or workout_sets.
 *
 * A mutation that writes either table must invalidate ALL of these, not just
 * the key it is scoped to. Each of these was found stale after logging a set:
 * Home said "Not started", History was missing the session, Stats lacked the
 * set. Prefix keys, so every user's and every parameter's entry matches.
 *
 * With staleTime 30s and a persisted cache, "stale" here did not mean "until
 * the next refresh" — it meant until the next hard reload.
 *
 * When adding a query that reads sessions or sets, add its prefix here. The
 * test in useWorkoutDay.test.tsx imports this list, so it cannot drift from
 * what is actually invalidated.
 */
export const SESSION_READERS = [
  "workoutDay",
  "lastSession",
  "coaching",
  "homeSessions",
  "workoutHistory",
  "sessionDetail",
  "lastLoggedDay",
  "historyDayNames",
  "workoutStats",
  "historyExerciseNames",
] as const;

export function invalidateSessionReaders(qc: QueryClient): void {
  for (const prefix of SESSION_READERS) {
    void qc.invalidateQueries({ queryKey: [prefix] });
  }
}

/**
 * Every query that reads food_log_entries. A diary write can change a day, the
 * Recent list and the TDEE hint's intake, so it invalidates all of them - the
 * lesson of SESSION_READERS above, applied before rather than after.
 */
export const NUTRITION_READERS = ["diary", "recents", "tdeeHint"] as const;

export function invalidateNutritionReaders(qc: QueryClient): void {
  for (const prefix of NUTRITION_READERS) {
    void qc.invalidateQueries({ queryKey: [prefix] });
  }
}
