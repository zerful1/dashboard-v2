import { pool } from "../db/pool";
import { T } from "../config";
import type { LiftSetRow, WorkoutSet, CardioEntry } from "@dashboard/shared";

/**
 * Every set, or one exercise's, with its session's date, oldest first: what the
 * lift stats read. No aggregation here; the rule lives
 * in shared, where it is tested.
 */
export async function liftRows(userId: string, exerciseName?: string): Promise<LiftSetRow[]> {
  const { rows } = await pool.query<LiftSetRow>(
    `SELECT s.session_id, ws.date::text AS date, s.exercise_name, s.set_number,
            s.weight_kg::float8 AS weight_kg, s.reps, s.reps_left, s.reps_right, s.is_bodyweight
       FROM ${T.workoutSets} s
       JOIN ${T.workoutSessions} ws ON ws.id = s.session_id
      WHERE s.user_id = $1 AND ws.user_id = $1
        AND ($2::text IS NULL OR s.exercise_name = $2)
      ORDER BY ws.date ASC, s.set_number ASC`,
    [userId, exerciseName ?? null],
  );
  return rows;
}

export interface SessionDetail {
  sets: WorkoutSet[];
  cardio: CardioEntry[];
}

export async function sessionDetail(
  userId: string,
  sessionId: string,
): Promise<SessionDetail> {
  const [sets, cardio] = await Promise.all([
    pool.query<WorkoutSet>(
      `SELECT id, user_id, session_id, exercise_name, set_number,
              weight_kg::float8 AS weight_kg, reps, reps_left, reps_right, is_bodyweight
         FROM ${T.workoutSets}
        WHERE user_id = $1 AND session_id = $2
        ORDER BY exercise_name, set_number`,
      [userId, sessionId],
    ),
    pool.query<CardioEntry>(
      `SELECT id, user_id, session_id, exercise,
              distance_miles::float8 AS distance_miles, duration_minutes,
              speed::float8 AS speed, incline::float8 AS incline, calories_burned
         FROM ${T.cardioEntries}
        WHERE user_id = $1 AND session_id = $2
        ORDER BY id`,
      [userId, sessionId],
    ),
  ]);
  return { sets: sets.rows, cardio: cardio.rows };
}

/**
 * Distinct exercise names from HISTORY, not the template.
 *
 * The template has 28 rows; the sets span far more, because exercises get
 * pruned over time. Listing from the template would make everything you have
 * stopped doing unreachable in stats — which is exactly the history worth
 * looking at.
 */
export async function historyExerciseNames(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ exercise_name: string }>(
    `SELECT DISTINCT exercise_name FROM ${T.workoutSets}
      WHERE user_id = $1 ORDER BY exercise_name`,
    [userId],
  );
  return rows.map((r) => r.exercise_name);
}
