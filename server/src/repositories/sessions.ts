import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import { getDayName } from "@dashboard/shared";
import type { SessionSummary, SplitConfig, WorkoutSession } from "@dashboard/shared";

const COLS = `id, user_id, date::text AS date, day_type, day_name, notes, created_at`;

/** Deletes a set or cardio entry, and its session if left empty and note-less; the session is locked first. */
export async function deleteFromSession(
  userId: string,
  table: typeof T.workoutSets | typeof T.cardioEntries,
  id: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT ws.id FROM ${T.workoutSessions} ws
        WHERE ws.user_id = $1
          AND ws.id = (SELECT session_id FROM ${table} WHERE user_id = $1 AND id = $2)
          FOR UPDATE`,
      [userId, id],
    );
    const sessionId = rows[0]?.id;
    if (!sessionId) return false;
    const gone = await client.query(`DELETE FROM ${table} WHERE user_id = $1 AND id = $2`, [userId, id]);
    if ((gone.rowCount ?? 0) === 0) return false;
    await client.query(
      `DELETE FROM ${T.workoutSessions} ws
        WHERE ws.user_id = $1 AND ws.id = $2
          AND coalesce(ws.notes, '') = ''
          AND NOT EXISTS (SELECT 1 FROM ${T.workoutSets} s WHERE s.session_id = ws.id)
          AND NOT EXISTS (SELECT 1 FROM ${T.cardioEntries} c WHERE c.session_id = ws.id)`,
      [userId, sessionId],
    );
    return true;
  });
}

export async function findSession(
  userId: string,
  date: string,
  dayType: number,
): Promise<WorkoutSession | null> {
  const { rows } = await pool.query<WorkoutSession>(
    `SELECT ${COLS} FROM ${T.workoutSessions}
      WHERE user_id = $1 AND date = $2 AND day_type = $3`,
    [userId, date, dayType],
  );
  return rows[0] ?? null;
}

/** Returns the session for (date, dayType), creating it; `day_name` is snapshotted at creation because day_type is reused across eras. */
export async function getOrCreateSession(
  userId: string,
  date: string,
  dayType: number,
  split: SplitConfig,
): Promise<WorkoutSession> {
  const { rows } = await pool.query<WorkoutSession>(
    `INSERT INTO ${T.workoutSessions} (user_id, date, day_type, day_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date, day_type)
       DO UPDATE SET day_type = ${T.workoutSessions}.day_type
     RETURNING ${COLS}`,
    [userId, date, dayType, getDayName(split, dayType)],
  );
  return rows[0]!;
}

export interface SessionListOptions {
  limit: number;
  offset: number;
  /** Filters on the snapshotted name, so retired split names still match. */
  dayName?: string;
  /** Only sessions on or after this date (History's grid). */
  since?: string;
}

/** Newest first with distinct exercises and set count; COUNT is a bigint that pg returns as a string, hence the casts. */
export async function listSessions(
  userId: string,
  opts: SessionListOptions,
): Promise<SessionSummary[]> {
  const { rows } = await pool.query<SessionSummary>(
    `SELECT ws.id, ws.user_id, ws.date::text AS date, ws.day_type, ws.day_name, ws.notes, ws.created_at,
            COALESCE(c.lifts, 0)::int AS lifts, COALESCE(c.sets, 0)::int AS sets
       FROM ${T.workoutSessions} ws
       LEFT JOIN (
         SELECT session_id, COUNT(DISTINCT exercise_name) AS lifts, COUNT(*) AS sets
           FROM ${T.workoutSets}
          WHERE user_id = $1
          GROUP BY session_id
       ) c ON c.session_id = ws.id
      WHERE ws.user_id = $1
        AND ($2::text IS NULL OR ws.day_name = $2)
        AND ($5::date IS NULL OR ws.date >= $5)
      -- A total order. Two sessions can share a date (two day types), and
      -- with date alone their order was the planner's to choose per query:
      -- across pages, one could show twice and the other not at all.
      ORDER BY ws.date DESC, ws.created_at DESC, ws.id DESC
      LIMIT $3 OFFSET $4`,
    [userId, opts.dayName ?? null, opts.limit, opts.offset, opts.since ?? null],
  );
  return rows;
}

/** Distinct snapshotted names, for the history filter chips. */
export async function listHistoryDayNames(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ day_name: string }>(
    `SELECT DISTINCT day_name FROM ${T.workoutSessions} WHERE user_id = $1 ORDER BY day_name`,
    [userId],
  );
  return rows.map((r) => r.day_name);
}
