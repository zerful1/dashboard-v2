import { pool } from "../db/pool";
import { T } from "../config";
import type { RecordSetRow, ReviewInputs } from "@dashboard/shared";

/** Everything a weekly review reads between two dates inclusive, for one user. */
export async function reviewInputs(userId: string, from: string, to: string): Promise<ReviewInputs> {
  const [sessions, sets, food, weights] = await Promise.all([
    pool.query<{ date: string }>(
      `SELECT date::text AS date FROM ${T.workoutSessions} WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
    pool.query<ReviewInputs["sets"][number]>(
      `SELECT s.date::text AS date, w.weight_kg::float8 AS weight_kg, w.reps, w.is_bodyweight
         FROM ${T.workoutSets} w JOIN ${T.workoutSessions} s ON s.id = w.session_id
        WHERE w.user_id = $1 AND s.user_id = $1 AND s.date BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
    pool.query<ReviewInputs["food"][number]>(
      `SELECT date::text AS date, calories::float8 AS calories, protein_g::float8 AS protein_g
         FROM ${T.foodLogEntries} WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
    pool.query<ReviewInputs["weights"][number]>(
      `SELECT date::text AS date, weight_kg::float8 AS weight_kg
         FROM ${T.bodyWeight} WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
  ]);
  return {
    sessionDates: sessions.rows.map((r) => r.date),
    sets: sets.rows,
    food: food.rows,
    weights: weights.rows,
  };
}

/** Every set the user has logged, with its session's date: the records' input. */
export async function recordRows(userId: string): Promise<RecordSetRow[]> {
  const { rows } = await pool.query<RecordSetRow>(
    `SELECT s.date::text AS date, w.exercise_name, w.weight_kg::float8 AS weight_kg, w.reps, w.is_bodyweight
       FROM ${T.workoutSets} w JOIN ${T.workoutSessions} s ON s.id = w.session_id
      WHERE w.user_id = $1 AND s.user_id = $1`,
    [userId],
  );
  return rows;
}
