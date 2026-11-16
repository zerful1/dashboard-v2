import { pool } from "../db/pool";
import { T } from "../config";
import type { BodyWeightEntry } from "@dashboard/shared";

export interface WeightInput {
  date: string; // YYYY-MM-DD, asserted by the client
  weight_kg: number;
  notes?: string | null;
}

/** Every function takes userId first; `date` is read ::text because node-pg's local-midnight Date shifts in BST. */
const COLS = `id, user_id, date::text AS date, weight_kg::float8 AS weight_kg, notes, created_at`;

export async function listWeights(userId: string): Promise<BodyWeightEntry[]> {
  const { rows } = await pool.query<BodyWeightEntry>(
    `SELECT ${COLS} FROM ${T.bodyWeight} WHERE user_id = $1 ORDER BY date DESC`,
    [userId],
  );
  return rows;
}

/** One weigh-in per day: the conflict target is (user_id, date), so users never collide. */
export async function upsertWeight(
  userId: string,
  input: WeightInput,
): Promise<BodyWeightEntry> {
  const { rows } = await pool.query<BodyWeightEntry>(
    `INSERT INTO ${T.bodyWeight} (user_id, date, weight_kg, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date)
     DO UPDATE SET weight_kg = EXCLUDED.weight_kg, notes = EXCLUDED.notes
     RETURNING ${COLS}`,
    [userId, input.date, input.weight_kg, input.notes ?? null],
  );
  return rows[0]!;
}

/** Scoped by user, so a foreign id deletes nothing and reports false (the route answers 404). */
export async function deleteWeight(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM ${T.bodyWeight} WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
