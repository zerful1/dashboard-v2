import { pool } from "../db/pool";
import { T } from "../config";
import { getDayName } from "@dashboard/shared";
import type { SessionSummary, SplitConfig, WorkoutSession } from "@dashboard/shared";

const COLS = `id, user_id, date::text AS date, day_type, day_name, notes, created_at`;

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

/**
 * Returns the session for (date, dayType), creating it if absent.
 *
 * `day_name` is SNAPSHOTTED from the split at creation time and never
 * recomputed. day_type is reused across split eras — in the migrated history
 * 'Upper A' and 'Legs' are both day_type 1, 'Upper B' and 'Pull' both 2 — so
 * resolving a name later would relabel five real sessions with whatever the
 * split says today. tests/sessions.test.ts asserts a later call with a renamed
 * split still returns the original snapshot.
 *
 * The upsert is atomic against UNIQUE (user_id, date, day_type): two concurrent
 * first-set logs cannot create two sessions. The DO UPDATE is a deliberate
 * no-op that exists only so the row is RETURNED on conflict — DO NOTHING
 * returns no rows, which would make the caller think creation failed.
 */
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

/**
 * Newest first, each with its distinct exercises and its set count for the
 * history list. COUNT is a bigint, which pg hands back
 * as a string, hence the casts.
 */
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
      ORDER BY ws.date DESC
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
