import { randomBytes } from "node:crypto";
import { pool } from "../db/pool";
import { T } from "../config";
import { Conflict } from "../errors";
import { createUserWithProfile, findUserByEmail } from "../repositories/users";
import { hashPassword } from "../services/password";

/** `.invalid` never routes (RFC 2606): no email can reach this address, even by mistake. */
export const DEMO_EMAIL = "demo@demo.invalid";

/**
 * How long a demo session lasts without activity: hours, not the month a real
 * one gets. The data refreshes only on entry, so a returning visitor must come
 * back through the button rather than find the demo as they left it. Rolling
 * sessions keep an active visitor in.
 */
export const DEMO_SESSION_MS = 6 * 60 * 60 * 1000;

export const isDemoEmail = (email: string) => email.trim().toLowerCase() === DEMO_EMAIL;

/**
 * The read-only demo's account, created on the first "Try the demo". Its
 * password is 32 random bytes nobody ever sees, and auth.ts treats the address
 * as unknown for login, reset and sign-up - so the demo route is the only way
 * in, and it always marks the session read-only.
 */
export async function findOrCreateDemoUser(): Promise<{ id: string; email: string }> {
  const existing = await findUserByEmail(DEMO_EMAIL);
  if (existing) return { id: existing.id, email: existing.email };
  try {
    const user = await createUserWithProfile(DEMO_EMAIL, await hashPassword(randomBytes(32).toString("hex")));
    await pool.query(`UPDATE ${T.profiles} SET display_name = 'Demo' WHERE user_id = $1`, [user.id]);
    return user;
  } catch (err) {
    // Two first visits at once: the other one created it.
    if (err instanceof Conflict) {
      const user = await findUserByEmail(DEMO_EMAIL);
      if (user) return { id: user.id, email: user.email };
    }
    throw err;
  }
}
