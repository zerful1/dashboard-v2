import { pool } from "../db/pool";
import { T } from "../config";
import type { WorkoutSet } from "@dashboard/shared";

const COLS = `id, user_id, session_id, exercise_name, set_number,
              weight_kg::float8 AS weight_kg, reps, reps_left, reps_right, is_bodyweight`;

export async function listSets(userId: string, sessionId: string): Promise<WorkoutSet[]> {
  const { rows } = await pool.query<WorkoutSet>(
    `SELECT ${COLS} FROM ${T.workoutSets}
      WHERE user_id = $1 AND session_id = $2
      ORDER BY exercise_name, set_number`,
    [userId, sessionId],
  );
  return rows;
}

export interface SetInput {
  sessionId: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  /** Both or neither, on a single-sided set; `reps` must then be the lower. */
  repsLeft?: number | null;
  repsRight?: number | null;
  isBodyweight: boolean;
}

/**
 * Insert or replace one set.
 *
 * UNIQUE (session_id, exercise_name, set_number) makes this race-proof without
 * a read-then-decide: two devices logging set 3 of the same exercise converge
 * rather than duplicating.
 *
 * weight_kg is forced to 0 when is_bodyweight, so no read site has to wonder
 * whether a stored weight was meaningful. Every read branches on the flag,
 * never on the value.
 */
export async function upsertSet(userId: string, input: SetInput): Promise<WorkoutSet> {
  const { rows } = await pool.query<WorkoutSet>(
    `INSERT INTO ${T.workoutSets}
       (user_id, session_id, exercise_name, set_number, weight_kg, reps, reps_left, reps_right, is_bodyweight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (session_id, exercise_name, set_number)
       DO UPDATE SET weight_kg = EXCLUDED.weight_kg,
                     reps = EXCLUDED.reps,
                     reps_left = EXCLUDED.reps_left,
                     reps_right = EXCLUDED.reps_right,
                     is_bodyweight = EXCLUDED.is_bodyweight
     RETURNING ${COLS}`,
    [
      userId,
      input.sessionId,
      input.exerciseName,
      input.setNumber,
      input.isBodyweight ? 0 : input.weightKg,
      input.reps,
      input.repsLeft ?? null,
      input.repsRight ?? null,
      input.isBodyweight,
    ],
  );
  return rows[0]!;
}

export async function deleteSet(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM ${T.workoutSets} WHERE user_id = $1 AND id = $2`, [
    userId,
    id,
  ]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * The most recent session of this day_type BEFORE `date`, grouped by exercise.
 *
 * Drives the "LAST · 80kg × 8" reference while logging. Strictly before, so
 * today's own sets are never offered back as last time's — which would make
 * every set look like a repeat of itself.
 */
export async function lastSessionSets(
  userId: string,
  dayType: number,
  beforeDate: string,
): Promise<Record<string, WorkoutSet[]>> {
  const { rows } = await pool.query<WorkoutSet>(
    `SELECT ${COLS} FROM ${T.workoutSets}
      WHERE user_id = $1 AND session_id = (
        SELECT id FROM ${T.workoutSessions}
         WHERE user_id = $1 AND day_type = $2 AND date < $3
         ORDER BY date DESC LIMIT 1)
      ORDER BY set_number`,
    [userId, dayType, beforeDate],
  );
  return rows.reduce<Record<string, WorkoutSet[]>>((acc, s) => {
    (acc[s.exercise_name] ??= []).push(s);
    return acc;
  }, {});
}
