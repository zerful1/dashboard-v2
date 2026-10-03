import { pool } from "../db/pool";
import { T } from "../config";
import type { StatSetRow, WorkoutSet, CardioEntry } from "@dashboard/shared";

export interface StatsPayload {
  sets: StatSetRow[];
  /** session_id -> YYYY-MM-DD. An object, not a Map — JSON has no Map. */
  sessionDates: Record<string, string>;
}

/**
 * Every set of one exercise, with the date of each owning session.
 *
 * computeExerciseStats needs both halves and groups by date itself, so this
 * deliberately does no aggregation — all the interpretation lives in shared,
 * where it is already tested.
 */
export async function exerciseStatRows(
  userId: string,
  exerciseName: string,
): Promise<StatsPayload> {
  const { rows } = await pool.query<StatSetRow & { date: string }>(
    `SELECT s.session_id, s.weight_kg::float8 AS weight_kg, s.reps, s.is_bodyweight,
            ws.date::text AS date
       FROM ${T.workoutSets} s
       JOIN ${T.workoutSessions} ws ON ws.id = s.session_id
      WHERE s.user_id = $1 AND s.exercise_name = $2
      ORDER BY ws.date ASC, s.set_number ASC`,
    [userId, exerciseName],
  );

  const sessionDates: Record<string, string> = {};
  for (const r of rows) sessionDates[r.session_id] = r.date;

  return {
    sets: rows.map(({ session_id, weight_kg, reps, is_bodyweight }) => ({
      session_id,
      weight_kg,
      reps,
      is_bodyweight,
    })),
    sessionDates,
  };
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
