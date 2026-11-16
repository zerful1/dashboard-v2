/** The tables a restore brings back, in insert order (parents before children). */
export const RESTORED_TABLES = [
  "body_weight",
  "nutrition_targets",
  "food_items",
  "food_log_entries",
  "workout_sessions",
  "workout_sets",
  "cardio_entries",
  "goals",
  "habits",
  "habit_completions",
] as const;

export type RestoredTable = (typeof RESTORED_TABLES)[number];

/** Rows a restore added (or, from a preview, would add), per table. */
export type RestoreCounts = Record<RestoredTable, number>;

/** The largest unpacked download a restore takes: the server's parser limit and the sheet's refusal size. */
export const RESTORE_MAX_BYTES = 50 * 1024 * 1024;
