import type { ExportFile } from "@dashboard/shared";
import { withTransaction } from "../db/pool";
import { T } from "../config";
import { NotFound } from "../errors";

/** A set's or a cardio entry's session date. They have none of their own. */
const SESSION_DATE = `(SELECT s.date FROM ${T.workoutSessions} s WHERE s.id = t.session_id)`;

/**
 * Every table with a user_id column, except password_reset_tokens, which holds
 * secrets. tests/export.test.ts holds this list to the database: a table added
 * with a user_id fails that test until it is listed here.
 */
const TABLES: { name: string; ref: string; orderBy: string }[] = [
  { name: "profiles", ref: T.profiles, orderBy: "t.user_id" },
  { name: "workout_split", ref: T.workoutSplit, orderBy: "t.user_id" },
  { name: "body_weight", ref: T.bodyWeight, orderBy: "t.date, t.created_at, t.id" },
  { name: "exercises", ref: T.exercises, orderBy: "t.day_type, t.sort_order, t.id" },
  { name: "workout_sessions", ref: T.workoutSessions, orderBy: "t.date, t.created_at, t.id" },
  { name: "workout_sets", ref: T.workoutSets, orderBy: `${SESSION_DATE}, t.session_id, t.exercise_name, t.set_number, t.id` },
  { name: "cardio_entries", ref: T.cardioEntries, orderBy: `${SESSION_DATE}, t.session_id, t.id` },
  { name: "nutrition_targets", ref: T.nutritionTargets, orderBy: "t.effective_from, t.created_at, t.id" },
  { name: "food_items", ref: T.foodItems, orderBy: "t.created_at, t.id" },
  { name: "food_log_entries", ref: T.foodLogEntries, orderBy: "t.date, t.logged_at, t.id" },
  { name: "goals", ref: T.goals, orderBy: "t.created_at, t.id" },
  { name: "habits", ref: T.habits, orderBy: "t.sort_order, t.created_at, t.id" },
  { name: "habit_completions", ref: T.habitCompletions, orderBy: "t.completed_date, t.id" },
  { name: "media", ref: T.media, orderBy: "t.created_at, t.id" },
  { name: "media_seasons", ref: T.mediaSeasons, orderBy: "t.media_id, t.season_number, t.id" },
  { name: "progress_photos", ref: T.progressPhotos, orderBy: "t.date, t.created_at, t.id" },
];

/**
 * Everything the user owns, for their backup. Postgres serialises each row
 * (to_jsonb), so dates stay YYYY-MM-DD text and numerics stay exact, and
 * node-pg's local-midnight Date parsing never touches the file (CLAUDE.md).
 */
export async function exportUserData(userId: string): Promise<ExportFile> {
  return withTransaction(async (client) => {
    // One snapshot for every read, so a write landing mid-export cannot leave
    // a set in the file without its session. It must be the first statement.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const { rows } = await client.query<{ account: ExportFile["account"] }>(
      `SELECT jsonb_build_object('id', id, 'email', email, 'created_at', created_at) AS account
         FROM ${T.users} WHERE id = $1`,
      [userId],
    );
    const account = rows[0]?.account;
    if (!account) throw new NotFound("Account not found");

    const tables: ExportFile["tables"] = {};
    for (const t of TABLES) {
      const res = await client.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS row FROM ${t.ref} t WHERE t.user_id = $1 ORDER BY ${t.orderBy}`,
        [userId],
      );
      tables[t.name] = res.rows.map((r) => r.row);
    }
    return { format: "dashboard-export", version: 1, exported_at: new Date().toISOString(), account, tables };
  });
}
