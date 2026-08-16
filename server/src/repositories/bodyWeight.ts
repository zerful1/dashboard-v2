import { pool } from "../db/pool";
import { T } from "../config";
import type { BodyWeightEntry } from "@dashboard/shared";

export interface WeightInput {
  date: string; // YYYY-MM-DD, asserted by the client
  weight_kg: number;
  notes?: string | null;
}

/**
 * The exemplar the remaining domain repositories copy. Two conventions matter
 * more than anything else here.
 *
 * Every function takes userId first and scopes its WHERE by it. This is the
 * pattern that replaces row-level security; there is no query path in this file
 * that can be built without a user scope, which is what makes the ownership
 * tests meaningful rather than decorative.
 *
 * `date` is selected as ::text throughout. node-pg parses a Postgres `date`
 * into a JS Date at LOCAL midnight, which during BST is 23:00 UTC the previous
 * day — so `toISOString().slice(0,10)` hands back the day before. It is correct
 * during GMT and wrong during BST, so the corruption is intermittent and a spot
 * check of a few winter rows looks perfect. Ten months of history just moved
 * through pure SQL specifically to avoid this; reading it back through a Date
 * would reintroduce it at the last step.
 *
 * `weight_kg` is ::float8 because numeric arrives as a string otherwise, and
 * BodyWeightEntry declares it a number.
 */
const COLS = `id, user_id, date::text AS date, weight_kg::float8 AS weight_kg, notes, created_at`;

export async function listWeights(userId: string): Promise<BodyWeightEntry[]> {
  const { rows } = await pool.query<BodyWeightEntry>(
    `SELECT ${COLS} FROM ${T.bodyWeight} WHERE user_id = $1 ORDER BY date DESC`,
    [userId],
  );
  return rows;
}

/**
 * One weigh-in per day: a second entry for the same date updates the first,
 * matching UNIQUE (user_id, date).
 *
 * The conflict target is (user_id, date), so two users weighing in on the same
 * day do not collide — a plain UNIQUE (date) would have made this a single-user
 * table without anyone noticing until the second account arrived.
 */
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

/**
 * Scoped by user, so a foreign id deletes nothing and reports not-found. The
 * boolean is what lets the route answer 404 rather than 403 — see the note
 * there.
 */
export async function deleteWeight(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM ${T.bodyWeight} WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
