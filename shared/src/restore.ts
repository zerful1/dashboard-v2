/**
 * The tables a restore brings back, in the order it inserts them: every parent
 * before its children. The server's restore and the
 * client's labels both read this list.
 */
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

/**
 * The largest download a restore takes, unpacked: the server's parser limit,
 * and the size past which the sheet refuses a file without reading it. A
 * year's download is far under it (the owner's was 0.5 MB).
 */
export const RESTORE_MAX_BYTES = 50 * 1024 * 1024;
