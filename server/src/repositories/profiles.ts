import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import type { ActivityLevel, Profile, Sex } from "@dashboard/shared";

export interface ProfilePatch {
  timezone?: string;
  /** null clears it; absent leaves it as it was. */
  height_cm?: number | null;
  birth_year?: number | null;
  sex?: Sex | null;
  activity_level?: ActivityLevel | null;
}

// height_cm is numeric, which arrives as a string without the cast.
const PROFILE_COLS = `user_id, timezone, updated_at,
       height_cm::float8 AS height_cm, birth_year, sex, activity_level`;

/** Every function takes `userId` first and scopes its WHERE by it: this replaces row-level security. */

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
  // COALESCE keeps an unmentioned field; body details take a "mentioned" flag so null can clear one.
  const { rows } = await pool.query<Profile>(
    `UPDATE ${T.profiles}
        SET timezone       = COALESCE($2, timezone),
            height_cm      = CASE WHEN $7::boolean  THEN $3 ELSE height_cm END,
            birth_year     = CASE WHEN $8::boolean  THEN $4 ELSE birth_year END,
            sex            = CASE WHEN $9::boolean  THEN $5 ELSE sex END,
            activity_level = CASE WHEN $10::boolean THEN $6 ELSE activity_level END,
            updated_at     = now()
      WHERE user_id = $1
      RETURNING ${PROFILE_COLS}`,
    [
      userId, patch.timezone ?? null,
      patch.height_cm ?? null, patch.birth_year ?? null, patch.sex ?? null, patch.activity_level ?? null,
      patch.height_cm !== undefined, patch.birth_year !== undefined, patch.sex !== undefined, patch.activity_level !== undefined,
    ],
  );
  return rows[0] ?? null;
}

/** Deletes the account: all cascades from users except `session` (no foreign key), removed explicitly. */
export async function deleteAccount(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM ${T.session} WHERE sess->>'userId' = $1`, [userId]);
    await client.query(`DELETE FROM ${T.users} WHERE id = $1`, [userId]);
  });
}
