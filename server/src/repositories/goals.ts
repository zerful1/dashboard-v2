import { pool } from "../db/pool";
import { T } from "../config";
import type { Goal, ProjectionPoint } from "@dashboard/shared";

// created_at as an ISO string, as the type says (see nutritionTargets.ts).
const COLS = `id, user_id, kind, exercise_name, target_kg::float8 AS target_kg,
              start_kg::float8 AS start_kg,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;
const MAX_LIFT_GOALS = 5;

export async function listGoals(userId: string): Promise<Goal[]> {
  const { rows } = await pool.query<Goal>(
    `SELECT ${COLS} FROM ${T.goals} WHERE user_id = $1 ORDER BY kind DESC, created_at`,
    [userId],
  );
  return rows;
}

/** One per user: setting it again replaces the target and re-reads the start. */
export async function setWeightGoal(userId: string, targetKg: number): Promise<Goal> {
  const { rows } = await pool.query<Goal>(
    `INSERT INTO ${T.goals} (user_id, kind, exercise_name, target_kg, start_kg)
     VALUES ($1, 'weight', NULL, $2,
             (SELECT weight_kg FROM ${T.bodyWeight} WHERE user_id = $1 ORDER BY date DESC LIMIT 1))
     ON CONFLICT (user_id, kind, (coalesce(exercise_name, '')))
       DO UPDATE SET target_kg = EXCLUDED.target_kg, start_kg = EXCLUDED.start_kg
     RETURNING ${COLS}`,
    [userId, targetKg],
  );
  return rows[0]!;
}

export async function addLiftGoal(
  userId: string,
  exerciseName: string,
  targetKg: number,
): Promise<Goal | "duplicate" | "full"> {
  const count = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${T.goals} WHERE user_id = $1 AND kind = 'lift'`,
    [userId],
  );
  if (count.rows[0]!.n >= MAX_LIFT_GOALS) return "full";
  const { rows } = await pool.query<Goal>(
    `INSERT INTO ${T.goals} (user_id, kind, exercise_name, target_kg, start_kg)
     VALUES ($1, 'lift', $2, $3,
             (SELECT max(weight_kg) FROM ${T.workoutSets}
               WHERE user_id = $1 AND exercise_name = $2 AND NOT is_bodyweight))
     ON CONFLICT (user_id, kind, (coalesce(exercise_name, ''))) DO NOTHING
     RETURNING ${COLS}`,
    [userId, exerciseName, targetKg],
  );
  return rows[0] ?? "duplicate";
}

export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM ${T.goals} WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (res.rowCount ?? 0) > 0;
}

/** Weigh-ins after `from`, up to and including `to`. */
export async function weightPoints(userId: string, from: string, to: string): Promise<ProjectionPoint[]> {
  const { rows } = await pool.query<ProjectionPoint>(
    `SELECT date::text AS date, weight_kg::float8 AS value FROM ${T.bodyWeight}
      WHERE user_id = $1 AND date > $2 AND date <= $3 ORDER BY date`,
    [userId, from, to],
  );
  return rows;
}

/** Each date's heaviest weighted set of one exercise: two sessions on a day count once. */
export async function liftPoints(
  userId: string,
  exerciseName: string,
  from: string,
  to: string,
): Promise<ProjectionPoint[]> {
  const { rows } = await pool.query<ProjectionPoint>(
    `SELECT s.date::text AS date, max(w.weight_kg)::float8 AS value
       FROM ${T.workoutSets} w JOIN ${T.workoutSessions} s ON s.id = w.session_id
      WHERE w.user_id = $1 AND s.user_id = $1 AND w.exercise_name = $2 AND NOT w.is_bodyweight
        AND s.date > $3 AND s.date <= $4
      GROUP BY s.date ORDER BY s.date`,
    [userId, exerciseName, from, to],
  );
  return rows;
}
