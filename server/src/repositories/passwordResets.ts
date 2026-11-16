import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool";
import { T } from "../config";
import { RESET_TTL_MINUTES } from "@dashboard/shared";

// Derived so the email body and the screens that promise a window cannot disagree with what is enforced.
const TTL_MS = RESET_TTL_MINUTES * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Issues a reset token; returns the RAW token to email and stores only its SHA-256. */
export async function createResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO ${T.passwordResetTokens} (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(raw), new Date(Date.now() + TTL_MS)],
  );
  return raw;
}

/** Atomically marks a token used and returns its user id; null if unknown, expired or spent. */
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
