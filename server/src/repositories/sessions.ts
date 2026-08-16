import { pool } from "../db/pool";
import { T } from "../config";
import { getDayName } from "@dashboard/shared";
import type { SplitConfig, WorkoutSession } from "@dashboard/shared";

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
 * split says today. Task 4's test asserts a later call with a renamed split
 * still returns the original snapshot.
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
}

export async function listSessions(
  userId: string,
  opts: SessionListOptions,
): Promise<WorkoutSession[]> {
  const { rows } = await pool.query<WorkoutSession>(
    `SELECT ${COLS} FROM ${T.workoutSessions}
      WHERE user_id = $1 AND ($2::text IS NULL OR day_name = $2)
      ORDER BY date DESC
      LIMIT $3 OFFSET $4`,
    [userId, opts.dayName ?? null, opts.limit, opts.offset],
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
