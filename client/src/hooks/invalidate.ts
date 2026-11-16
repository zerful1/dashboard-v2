import type { QueryClient } from "@tanstack/react-query";

/** Every Insights query; the writers of sessions, sets, food and weigh-ins invalidate them. */
export const INSIGHTS_READERS = ["insightsReview", "insightsRecords", "insightsProjections"] as const;

export function invalidateInsightsReaders(qc: QueryClient): void {
  for (const prefix of INSIGHTS_READERS) {
    void qc.invalidateQueries({ queryKey: [prefix] });
  }
}

/** Every query reading workout_sessions or workout_sets: a write to either must invalidate ALL of them. */
export const SESSION_READERS = [
  "workoutDay",
  "lastTimes",
  "coaching",
  "homeSessions",
  "workoutHistory",
  "sessionDetail",
  "lastLoggedDay",
  "historyDayNames",
  "workoutStats",
  "liftProgress",
  "trainingGrid",
  "historyExerciseNames",
  ...INSIGHTS_READERS,
] as const;

export function invalidateSessionReaders(qc: QueryClient): void {
  for (const prefix of SESSION_READERS) {
    void qc.invalidateQueries({ queryKey: [prefix] });
  }
}

/** Every query that reads food_log_entries: a diary write can change a day, Recent and the TDEE hint. */
export const NUTRITION_READERS = ["diary", "recents", "tdeeHint", "foodDays", ...INSIGHTS_READERS] as const;

export function invalidateNutritionReaders(qc: QueryClient): void {
  for (const prefix of NUTRITION_READERS) {
    void qc.invalidateQueries({ queryKey: [prefix] });
  }
}
