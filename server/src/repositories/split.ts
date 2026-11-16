import { pool } from "../db/pool";
import { T } from "../config";
import { DEFAULT_SPLIT, type SplitConfig } from "@dashboard/shared";

/** Always resolves to a config, falling back to DEFAULT_SPLIT, so callers never branch on "has a split yet". */
export async function getSplit(userId: string): Promise<SplitConfig> {
  const { rows } = await pool.query<{ config: SplitConfig }>(
    `SELECT config FROM ${T.workoutSplit} WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.config ?? DEFAULT_SPLIT;
}

/** One mutable row per user (user_id is the primary key). */
export async function saveSplit(userId: string, config: SplitConfig): Promise<SplitConfig> {
  const { rows } = await pool.query<{ config: SplitConfig }>(
    `INSERT INTO ${T.workoutSplit} (user_id, config, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()
     RETURNING config`,
    [userId, JSON.stringify(config)],
  );
  return rows[0]!.config;
}
