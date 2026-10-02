import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import { dedupRecents } from "@dashboard/shared";
import type { DiaryEntryInput, FoodLogEntry, RecentFood } from "@dashboard/shared";
import { listFoodItemsByIds, ownsFoodItem, upsertFoodItem } from "./foodItems";

const NUMERIC = ["quantity", "calories", "protein_g", "fat_g", "carbs_g", "fibre_g", "sugar_g", "sat_fat_g", "salt_g"] as const;
const SNAPSHOT = ["calories", "protein_g", "fat_g", "carbs_g", "fibre_g", "sugar_g", "sat_fat_g", "salt_g"] as const;

// date::text for the BST reason in bodyWeight.ts. logged_at is an instant
// (timestamptz), so it is safe as a Date and serialises to ISO.
export const ENTRY_COLS = [
  "id", "user_id", "date::text AS date", "logged_at", "food_item_id", "name", "unit",
  ...NUMERIC.map((c) => `${c}::float8 AS ${c}`),
].join(", ");

export async function listDiary(userId: string, date: string): Promise<FoodLogEntry[]> {
  const { rows } = await pool.query<FoodLogEntry>(
    `SELECT ${ENTRY_COLS} FROM ${T.foodLogEntries}
      WHERE user_id = $1 AND date = $2
      ORDER BY logged_at, id`,
    [userId, date],
  );
  return rows;
}

/**
 * Log one entry. With `food`, the food is stored in the library first and
 * linked; with `food_item_id`, it must be the caller's own, and null is
 * returned when it is not - the route answers 404, as for a foreign diary id.
 * One transaction, so a failed insert never leaves an orphan food behind.
 */
export async function addEntry(userId: string, input: DiaryEntryInput): Promise<FoodLogEntry | null> {
  return withTransaction(async (client) => {
    let foodItemId: string | null = null;
    if (input.food) {
      foodItemId = await upsertFoodItem(client, userId, input.food);
    } else if (input.food_item_id) {
      if (!(await ownsFoodItem(client, userId, input.food_item_id))) return null;
      foodItemId = input.food_item_id;
    }
    const { rows } = await client.query<FoodLogEntry>(
      `INSERT INTO ${T.foodLogEntries}
         (user_id, date, food_item_id, name, quantity, unit, calories, protein_g, fat_g, carbs_g,
          fibre_g, sugar_g, sat_fat_g, salt_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${ENTRY_COLS}`,
      [
        userId, input.date, foodItemId, input.name, input.quantity, input.unit,
        input.calories, input.protein_g, input.fat_g, input.carbs_g,
        input.fibre_g ?? null, input.sugar_g ?? null, input.sat_fat_g ?? null, input.salt_g ?? null,
      ],
    );
    return rows[0]!;
  });
}

/**
 * Change the amount. The snapshot is linear in quantity, so every nutrient
 * scales by new/old - in SQL, where SET expressions all read the row's OLD
 * values. NULL scales to NULL, so an unknown stays unknown.
 */
export async function rescaleEntry(userId: string, id: string, quantity: number): Promise<FoodLogEntry | null> {
  const scaled = SNAPSHOT.map((c) => `${c} = ${c} * $3 / quantity`).join(", ");
  const { rows } = await pool.query<FoodLogEntry>(
    `UPDATE ${T.foodLogEntries}
        SET ${scaled}, quantity = $3
      WHERE user_id = $1 AND id = $2
      RETURNING ${ENTRY_COLS}`,
    [userId, id, quantity],
  );
  return rows[0] ?? null;
}

/** Scoped, so a foreign id deletes nothing and reports false - see weight.ts on 404 vs 403. */
export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM ${T.foodLogEntries} WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Append a copy of every entry on `from` to `to`. Each logged_at moves by the
 * whole days between the dates, so the copies keep their times and order.
 */
export async function copyDay(userId: string, from: string, to: string): Promise<FoodLogEntry[]> {
  const { rows } = await pool.query<FoodLogEntry>(
    `WITH ins AS (
       INSERT INTO ${T.foodLogEntries}
         (user_id, date, logged_at, food_item_id, name, quantity, unit, calories, protein_g, fat_g, carbs_g,
          fibre_g, sugar_g, sat_fat_g, salt_g)
       SELECT user_id, $3::date, logged_at + ($3::date - $2::date) * interval '1 day',
              food_item_id, name, quantity, unit, calories, protein_g, fat_g, carbs_g,
              fibre_g, sugar_g, sat_fat_g, salt_g
         FROM ${T.foodLogEntries}
        WHERE user_id = $1 AND date = $2::date
       RETURNING *
     )
     SELECT ${ENTRY_COLS} FROM ins ORDER BY logged_at, id`,
    [userId, from, to],
  );
  return rows;
}

/**
 * Distinct foods the user logged most recently, each with its latest entry
 * (whose amount is the default next time) and its library item when linked.
 * Two scoped queries rather than a join, so an item can only ever come from
 * the caller's own library.
 */
export async function listRecents(userId: string, limit = 30): Promise<RecentFood[]> {
  const { rows } = await pool.query<FoodLogEntry>(
    `SELECT ${ENTRY_COLS} FROM ${T.foodLogEntries}
      WHERE user_id = $1
      ORDER BY logged_at DESC, id DESC
      LIMIT 200`,
    [userId],
  );
  const recents = dedupRecents(rows, limit);
  const ids = [...new Set(recents.map((e) => e.food_item_id).filter((v): v is string => v !== null))];
  const items = ids.length > 0 ? await listFoodItemsByIds(userId, ids) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  return recents.map((entry) => ({
    entry,
    item: entry.food_item_id ? (byId.get(entry.food_item_id) ?? null) : null,
  }));
}
