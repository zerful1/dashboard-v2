import type { PoolClient } from "pg";
import { shiftISO } from "@dashboard/shared";
import { withTransaction } from "../db/pool";
import { T } from "../config";
import { generateDemo } from "./generate";

export const DEMO_TIMEZONE = "Europe/London";
// Any constant: two visitors arriving together queue on it rather than both rebuild.
const LOCK_KEY = 2026_10_04;

async function insertMany(client: PoolClient, table: string, columns: string[], rows: unknown[][]) {
  const per = Math.floor(60000 / columns.length);
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const values = chunk
      .map((_, r) => `(${columns.map((__, c) => `$${r * columns.length + c + 1}`).join(", ")})`)
      .join(", ");
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values}`, chunk.flat());
  }
}

/**
 * Swap the demo account's data for a fresh copy around `today`, when its newest
 * weigh-in is older than yesterday. One transaction, behind an advisory lock,
 * re-checking staleness once the lock is held. Every statement is scoped to
 * the demo account's id.
 */
export async function refreshDemoIfStale(userId: string, today: string): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const { rows } = await client.query<{ d: string | null }>(
      `SELECT max(date)::text AS d FROM ${T.bodyWeight} WHERE user_id = $1`,
      [userId],
    );
    const newest = rows[0]?.d ?? null;
    if (newest !== null && newest >= shiftISO(today, -1)) return false;

    // Sets and cardio go with their sessions (ON DELETE CASCADE).
    // Completions go with their habits (ON DELETE CASCADE).
    for (const table of [T.workoutSessions, T.exercises, T.bodyWeight, T.foodLogEntries, T.nutritionTargets, T.workoutSplit, T.goals, T.habits]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }

    const d = generateDemo(today);
    await insertMany(client, T.exercises, ["user_id", "day_type", "exercise_name", "sort_order"],
      d.exercises.map((e) => [userId, e.day_type, e.exercise_name, e.sort_order]));
    const sessionIds = new Map<number, string>();
    if (d.sessions.length) {
      const values = d.sessions.map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`).join(", ");
      const inserted = await client.query<{ id: string; date: string; day_type: number }>(
        `INSERT INTO ${T.workoutSessions} (user_id, date, day_type, day_name, notes) VALUES ${values}
         RETURNING id, date::text AS date, day_type`,
        [userId, ...d.sessions.flatMap((s) => [s.date, s.day_type, s.day_name, s.notes])],
      );
      // Matched by (date, day_type), unique per user, not by RETURNING order.
      const byKey = new Map(inserted.rows.map((r) => [`${r.date}|${r.day_type}`, r.id]));
      for (const s of d.sessions) sessionIds.set(s.key, byKey.get(`${s.date}|${s.day_type}`)!);
    }
    await insertMany(client, T.workoutSets,
      ["user_id", "session_id", "exercise_name", "set_number", "weight_kg", "reps", "reps_left", "reps_right", "is_bodyweight"],
      d.sets.map((s) => [userId, sessionIds.get(s.session), s.exercise_name, s.set_number, s.weight_kg, s.reps, s.reps_left, s.reps_right, s.is_bodyweight]));
    await insertMany(client, T.cardioEntries,
      ["user_id", "session_id", "exercise", "distance_miles", "duration_minutes", "speed", "incline", "calories_burned"],
      d.cardio.map((c) => [userId, sessionIds.get(c.session), c.exercise, c.distance_miles, c.duration_minutes, c.speed, c.incline, c.calories_burned]));
    await insertMany(client, T.bodyWeight, ["user_id", "date", "weight_kg"], d.weights.map((w) => [userId, w.date, w.weight_kg]));
    await insertMany(client, T.foodLogEntries,
      ["user_id", "date", "logged_at", "name", "quantity", "unit", "calories", "protein_g", "fat_g", "carbs_g", "fibre_g", "sugar_g", "sat_fat_g", "salt_g"],
      d.food.map((f) => [userId, f.date, f.logged_at, f.name, f.quantity, f.unit, f.calories, f.protein_g, f.fat_g, f.carbs_g, f.fibre_g, f.sugar_g, f.sat_fat_g, f.salt_g]));
    const t = d.target;
    await client.query(
      `INSERT INTO ${T.nutritionTargets} (user_id, effective_from, goal_mode, calories, protein_g, fat_g, carbs_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, t.effective_from, t.goal_mode, t.calories, t.protein_g, t.fat_g, t.carbs_g],
    );
    await insertMany(client, T.goals, ["user_id", "kind", "exercise_name", "target_kg", "start_kg"],
      d.goals.map((g) => [userId, g.kind, g.exercise_name, g.target_kg, g.start_kg]));
    if (d.habits.length) {
      const values = d.habits.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(", ");
      const inserted = await client.query<{ id: string; sort_order: number }>(
        `INSERT INTO ${T.habits} (user_id, name, emoji, sort_order) VALUES ${values} RETURNING id, sort_order`,
        [userId, ...d.habits.flatMap((h) => [h.name, h.emoji, h.sort_order])],
      );
      // Matched by sort_order, unique within the demo's habits, not by RETURNING order.
      const bySort = new Map(inserted.rows.map((r) => [r.sort_order, r.id]));
      await insertMany(client, T.habitCompletions, ["user_id", "habit_id", "completed_date"],
        d.habitDays.map((x) => [userId, bySort.get(d.habits[x.habit]!.sort_order), x.date]));
    }
    return true;
  });
}
