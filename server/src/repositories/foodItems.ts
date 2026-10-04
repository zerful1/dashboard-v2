import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { T } from "../config";
import type { FoodInput, FoodItem } from "@dashboard/shared";

/** The nutrition columns, in one order shared by every insert and select. */
export const NUTRITION_COLUMNS = [
  "serving_description", "serving_grams",
  "kcal_per_serving", "protein_per_serving", "fat_per_serving", "carbs_per_serving",
  "kcal_per_100g", "protein_per_100g", "fat_per_100g", "carbs_per_100g",
  "fibre_per_100g", "sugar_per_100g", "sat_fat_per_100g", "salt_per_100g",
  "fibre_per_serving", "sugar_per_serving", "sat_fat_per_serving", "salt_per_serving",
] as const satisfies readonly (keyof FoodInput)[];

// Every nutrition column but the description is numeric, which arrives as a
// string without the cast.
export const ITEM_COLS = [
  "id", "user_id", "name", "brand", "is_favourite", "external_source", "external_id", "barcode", "created_at",
  "serving_description",
  ...NUTRITION_COLUMNS.filter((c) => c !== "serving_description").map((c) => `${c}::float8 AS ${c}`),
].join(", ");

/**
 * Serving data is replaced whole or kept whole. A text-search hit brings none,
 * so the stored serving stays (#17 review 9); a barcode lookup brings a whole
 * serving, which replaces the old one entirely, so its unknown label values
 * never keep the previous serving's (part 1 final review, M3).
 */
const SERVING_COLUMNS = new Set<string>(
  NUTRITION_COLUMNS.filter((c) => c === "serving_description" || c === "serving_grams" || c.endsWith("_per_serving")),
);

/**
 * Store `food` in the user's library and return its id, inside the caller's
 * transaction. Search foods upsert on (user_id, external_source, external_id),
 * refreshing their values, so logging one product twice keeps one row. Manual
 * foods always insert: they have no external id, and NULLs never conflict.
 */
export async function upsertFoodItem(client: PoolClient, userId: string, food: FoodInput): Promise<string> {
  const columns = ["user_id", "external_source", "external_id", "name", "brand", "barcode", ...NUTRITION_COLUMNS];
  const values = [
    userId, food.source, food.external_id, food.name, food.brand, food.barcode ?? null, ...NUTRITION_COLUMNS.map((c) => food[c]),
  ];
  const servingKept = "(EXCLUDED.serving_grams IS NULL AND EXCLUDED.kcal_per_serving IS NULL)";
  const onConflict =
    food.source === "manual"
      ? ""
      : `ON CONFLICT (user_id, external_source, external_id) DO UPDATE SET ${[
          ...["name", "brand", ...NUTRITION_COLUMNS].map((c) =>
            SERVING_COLUMNS.has(c) ? `${c} = CASE WHEN ${servingKept} THEN fi.${c} ELSE EXCLUDED.${c} END` : `${c} = EXCLUDED.${c}`,
          ),
          // A barcode, once stored, is never cleared by a log that lacks one.
          "barcode = COALESCE(EXCLUDED.barcode, fi.barcode)",
        ].join(", ")}`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ${T.foodItems} AS fi (${columns.join(", ")})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
     ${onConflict}
     RETURNING id`,
    values,
  );
  return rows[0]!.id;
}

/** Whether `id` is one of `userId`'s foods. Linking to anyone else's would leak it through Recent. */
export async function ownsFoodItem(client: PoolClient, userId: string, id: string): Promise<boolean> {
  const res = await client.query(`SELECT 1 FROM ${T.foodItems} WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (res.rowCount ?? 0) > 0;
}

export async function listFoodItemsByIds(userId: string, ids: string[]): Promise<FoodItem[]> {
  const { rows } = await pool.query<FoodItem>(
    `SELECT ${ITEM_COLS} FROM ${T.foodItems} WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids],
  );
  return rows;
}
