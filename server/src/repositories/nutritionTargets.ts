import { pool } from "../db/pool";
import { T } from "../config";
import type { NutritionTarget, TargetInput } from "@dashboard/shared";

// effective_from as ::text for the reason bodyWeight selects date::text:
// node-pg would hand back a local-midnight Date that shifts a day during BST.
// created_at as an ISO string, as the type says: latestActiveTarget breaks a
// same-day tie with created_at.localeCompare, and node-pg would hand back a
// Date (the weekly review crashed on exactly that). Byte-identical to the JSON
// a Date serialises to, so the API's wire format does not change.
const COLS = `id, user_id, effective_from::text AS effective_from, goal_mode,
              calories, protein_g, fat_g, carbs_g,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;

/** Every row, newest first. latestActiveTarget in shared picks the one in force on a day. */
export async function listTargets(userId: string): Promise<NutritionTarget[]> {
  const { rows } = await pool.query<NutritionTarget>(
    `SELECT ${COLS} FROM ${T.nutritionTargets}
      WHERE user_id = $1
      ORDER BY effective_from DESC, created_at DESC`,
    [userId],
  );
  return rows;
}

/** Insert-only: a new target is a new dated row, so past days keep the target they had. */
export async function insertTarget(userId: string, input: TargetInput): Promise<NutritionTarget> {
  const { rows } = await pool.query<NutritionTarget>(
    `INSERT INTO ${T.nutritionTargets} (user_id, effective_from, goal_mode, calories, protein_g, fat_g, carbs_g)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLS}`,
    [userId, input.effective_from, input.goal_mode, input.calories, input.protein_g, input.fat_g, input.carbs_g],
  );
  return rows[0]!;
}
