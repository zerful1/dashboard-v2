import type { DataSummary, ExportFile } from "@dashboard/shared";
import { pool, withTransaction } from "../db/pool";
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
];

/** The tables a download holds, by name. Restore's table split is held to this list. */
export const EXPORT_TABLE_NAMES = TABLES.map((t) => t.name);

/**
 * Everything the user owns, for their backup, written as JSON text one table
 * at a time so the route can stream it. Vercel caps a response sent in one
 * piece at 4.5 MB, and the owner's file grows by about 2 MB a year.
 *
 * Postgres serialises each row (`to_json(t)::text`), so dates stay YYYY-MM-DD
 * text, numerics stay exact, and node-pg's local-midnight Date parsing never
 * touches the file (CLAUDE.md). `json`, not `jsonb`: it keeps column order,
 * which matters in a file a person reads.
 *
 * Throws NotFound before writing anything when the user row is gone.
 */
export async function writeUserExport(userId: string, write: (chunk: string) => void): Promise<void> {
  await withTransaction(async (client) => {
    // One snapshot for every read, so a write landing mid-export cannot leave
    // a set in the file without its session. It must be the first statement.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const { rows } = await client.query<{ account: string }>(
      `SELECT json_build_object('id', id, 'email', email, 'created_at', created_at)::text AS account
         FROM ${T.users} WHERE id = $1`,
      [userId],
    );
    const account = rows[0]?.account;
    if (!account) throw new NotFound("Account not found");

    const exportedAt = JSON.stringify(new Date().toISOString());
    write(`{"format":"dashboard-export","version":1,"exported_at":${exportedAt},"account":${account},"tables":{`);
    for (const [i, t] of TABLES.entries()) {
      const res = await client.query<{ row: string }>(
        `SELECT to_json(t)::text AS row FROM ${t.ref} t WHERE t.user_id = $1 ORDER BY ${t.orderBy}`,
        [userId],
      );
      write(`${i > 0 ? "," : ""}${JSON.stringify(t.name)}:[${res.rows.map((r) => r.row).join(",")}]`);
    }
    write("}}");
  });
}

/**
 * How much the user has logged, and since when: Settings' line beside the
 * download. LEAST skips nulls, so `since` is null only when all three are.
 */
export async function getDataSummary(userId: string): Promise<DataSummary> {
  const { rows } = await pool.query<DataSummary>(
    `SELECT LEAST(
              (SELECT min(date) FROM ${T.bodyWeight} WHERE user_id = $1),
              (SELECT min(date) FROM ${T.workoutSessions} WHERE user_id = $1),
              (SELECT min(date) FROM ${T.foodLogEntries} WHERE user_id = $1)
            )::text AS since,
            (SELECT count(*) FROM ${T.bodyWeight} WHERE user_id = $1)::int AS "weighIns",
            (SELECT count(*) FROM ${T.workoutSessions} WHERE user_id = $1)::int AS sessions,
            (SELECT count(DISTINCT date) FROM ${T.foodLogEntries} WHERE user_id = $1)::int AS "foodDays",
            (SELECT count(*) FROM ${T.habits} WHERE user_id = $1)::int AS habits`,
    [userId],
  );
  return rows[0]!;
}

/** The whole export as one object, for anything that wants it in memory. */
export async function exportUserData(userId: string): Promise<ExportFile> {
  let text = "";
  await writeUserExport(userId, (chunk) => {
    text += chunk;
  });
  return JSON.parse(text) as ExportFile;
}
