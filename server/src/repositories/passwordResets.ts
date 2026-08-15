import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool";
import { T } from "../config";
import { RESET_TTL_MINUTES } from "@dashboard/shared";

// Derived, not written down again: the email body and the two screens that
// promise a window all read the same constant, so they cannot disagree with
// what this actually enforces.
const TTL_MS = RESET_TTL_MINUTES * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a reset token. Returns the RAW token to email; only its SHA-256 is stored,
 * so a database leak does not hand over working reset links.
 */
export async function createResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO ${T.passwordResetTokens} (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), new Date(Date.now() + TTL_MS)],
  );
  return raw;
}

/**
 * Atomically mark a token used and return its user id, or null if it is unknown,
 * expired or already spent.
 *
 * Consumption happens inside the UPDATE ... RETURNING, so two concurrent requests
 * with the same token cannot both succeed.
 */
export async function consumeResetToken(raw: string): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE ${T.passwordResetTokens}
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [hashToken(raw)],
  );
  return rows[0]?.user_id ?? null;
}
