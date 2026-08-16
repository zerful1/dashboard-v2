import { pool } from "../db/pool";
import { T } from "../config";
import type { SessionGroup } from "@dashboard/shared";

/**
 * The last `limit` sessions containing this exercise, NEWEST FIRST, each as a
 * flat list of its sets.
 *
 * Order is load-bearing, not cosmetic. computeRecommendation reads index 0 as
 * the most recent session (`const latest = sessionGroups[0]`) and its deload
 * rule inspects the first three. Reversing this produces confident advice based
 * on the oldest sessions — which would look entirely plausible and be wrong.
 */
export async function recentSessionGroups(
  userId: string,
  exerciseName: string,
  limit = 3,
): Promise<SessionGroup[]> {
  const { rows } = await pool.query<{
    session_id: string;
    date: string;
    weight_kg: number;
    reps: number;
    is_bodyweight: boolean;
  }>(
    `SELECT s.session_id, ws.date::text AS date,
            s.weight_kg::float8 AS weight_kg, s.reps, s.is_bodyweight
       FROM ${T.workoutSets} s
       JOIN ${T.workoutSessions} ws ON ws.id = s.session_id
      WHERE s.user_id = $1 AND s.exercise_name = $2
        AND ws.id IN (
          SELECT ws2.id FROM ${T.workoutSessions} ws2
            JOIN ${T.workoutSets} s2 ON s2.session_id = ws2.id
           WHERE ws2.user_id = $1 AND s2.exercise_name = $2
           GROUP BY ws2.id, ws2.date
           ORDER BY ws2.date DESC
           LIMIT $3)
      ORDER BY ws.date DESC, s.set_number ASC`,
    [userId, exerciseName, limit],
  );

  const byDate = new Map<string, SessionGroup>();
  for (const r of rows) {
    const group = byDate.get(r.date) ?? [];
    group.push({ weight_kg: r.weight_kg, reps: r.reps, is_bodyweight: r.is_bodyweight });
    byDate.set(r.date, group);
  }
  // Map preserves insertion order, and rows arrive date DESC, so this is
  // already newest-first.
  return [...byDate.values()];
}
