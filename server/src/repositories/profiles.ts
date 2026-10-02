import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import type { Profile, WeightUnit } from "@dashboard/shared";

export interface ProfilePatch {
  display_name?: string;
  units?: WeightUnit;
  timezone?: string;
}

// birth_year is smallint, which node-pg returns as a number; height_cm is
// numeric, which would arrive as a string without the cast.
const PROFILE_COLS = `user_id, display_name, avatar_path, units, timezone, updated_at,
       height_cm::float8 AS height_cm, birth_year, sex, activity_level`;

/**
 * Every function here takes `userId` FIRST and scopes its WHERE by it.
 *
 * This is what replaces Supabase's row-level security. There is no query path in
 * this layer that can be built without a user scope, and routes never write SQL of
 * their own — they call these with `req.userId`, which comes only from the session.
 */

export async function getProfile(userId: string): Promise<Profile | null> {
  const { rows } = await pool.query<Profile>(
    `SELECT ${PROFILE_COLS}
       FROM ${T.profiles}
      WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<Profile | null> {
  const { rows } = await pool.query<Profile>(
    `UPDATE ${T.profiles}
        SET display_name = COALESCE($2, display_name),
            units        = COALESCE($3, units),
            timezone     = COALESCE($4, timezone),
            updated_at   = now()
      WHERE user_id = $1
      RETURNING ${PROFILE_COLS}`,
    [userId, patch.display_name ?? null, patch.units ?? null, patch.timezone ?? null],
  );
  return rows[0] ?? null;
}

/**
 * Delete the account. Every user-owned table cascades from users via
 * ON DELETE CASCADE — except `session`, which has no foreign key, so its rows are
 * removed explicitly or they outlive the account they belonged to.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM ${T.session} WHERE sess->>'userId' = $1`, [userId]);
    await client.query(`DELETE FROM ${T.users} WHERE id = $1`, [userId]);
  });
}
