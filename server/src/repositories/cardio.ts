import { pool } from "../db/pool";
import { T } from "../config";
import type { CardioEntry } from "@dashboard/shared";

const COLS = `id, user_id, session_id, exercise,
              distance_miles::float8 AS distance_miles, duration_minutes,
              speed::float8 AS speed, incline::float8 AS incline, calories_burned`;

export interface CardioFields {
  exercise: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  speed: number | null;
  incline: number | null;
  calories_burned: number | null;
}

export async function listCardio(userId: string, sessionId: string): Promise<CardioEntry[]> {
  const { rows } = await pool.query<CardioEntry>(
    `SELECT ${COLS} FROM ${T.cardioEntries}
      WHERE user_id = $1 AND session_id = $2 ORDER BY id`,
    [userId, sessionId],
  );
  return rows;
}

export async function addCardio(
  userId: string,
  sessionId: string,
  f: CardioFields,
): Promise<CardioEntry> {
  const { rows } = await pool.query<CardioEntry>(
    `INSERT INTO ${T.cardioEntries}
       (user_id, session_id, exercise, distance_miles, duration_minutes, speed, incline, calories_burned)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
    [
      userId,
      sessionId,
      f.exercise,
      f.distance_miles,
      f.duration_minutes,
      f.speed,
      f.incline,
      f.calories_burned,
    ],
  );
  return rows[0]!;
}

/**
 * Every field is replaced — the client sends the whole entry, not a diff.
 *
 * Returns null rather than throwing when nothing matched, so the route can
 * answer 404 without distinguishing "no such entry" from "not yours".
 */
export async function updateCardio(
  userId: string,
  id: string,
  f: CardioFields,
): Promise<CardioEntry | null> {
  const { rows } = await pool.query<CardioEntry>(
    `UPDATE ${T.cardioEntries}
        SET exercise = $3, distance_miles = $4, duration_minutes = $5,
            speed = $6, incline = $7, calories_burned = $8
      WHERE user_id = $1 AND id = $2
      RETURNING ${COLS}`,
    [
      userId,
      id,
      f.exercise,
      f.distance_miles,
      f.duration_minutes,
      f.speed,
      f.incline,
      f.calories_burned,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteCardio(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM ${T.cardioEntries} WHERE user_id = $1 AND id = $2`, [
    userId,
    id,
  ]);
  return (res.rowCount ?? 0) > 0;
}
