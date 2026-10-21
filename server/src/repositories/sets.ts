import { pool } from "../db/pool";
import { T } from "../config";
import type { LastTime, WorkoutSet } from "@dashboard/shared";

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
 * "Last time" for each named exercise: the newest session
 * dated before `before` that holds a set of it, on ANY day type (a same-date
 * tie goes to the later session), and that session's sets of it. Strictly
 * before, so today's own sets are never offered back as last time's. day_type
 * is reused across split eras, so the same-day-type rule this replaces could
 * compare against another era's day, and showed nothing when the last
 * same-day session skipped the exercise.
 */
export async function lastTimes(
  userId: string,
  names: string[],
  before: string,
): Promise<Record<string, LastTime>> {
  const { rows } = await pool.query<WorkoutSet & { date: string }>(
    `WITH latest AS (
       SELECT DISTINCT ON (s.exercise_name) s.exercise_name, s.session_id, ws.date
         FROM ${T.workoutSets} s
         JOIN ${T.workoutSessions} ws ON ws.id = s.session_id
        WHERE s.user_id = $1 AND ws.user_id = $1
          AND s.exercise_name = ANY($2::text[])
          AND ws.date < $3
        ORDER BY s.exercise_name, ws.date DESC, ws.created_at DESC
     )
     SELECT s.id, s.user_id, s.session_id, s.exercise_name, s.set_number,
            s.weight_kg::float8 AS weight_kg, s.reps, s.reps_left, s.reps_right,
            s.is_bodyweight, latest.date::text AS date
       FROM ${T.workoutSets} s
       JOIN latest ON latest.session_id = s.session_id AND latest.exercise_name = s.exercise_name
      WHERE s.user_id = $1
      ORDER BY s.exercise_name, s.set_number`,
    [userId, names, before],
  );
  return rows.reduce<Record<string, LastTime>>((acc, { date, ...set }) => {
    (acc[set.exercise_name] ??= { date, sets: [] }).sets.push(set);
    return acc;
  }, {});
}
