import { randomBytes } from "node:crypto";
import { Conflict } from "../errors";
import { createUserWithProfile, findUserByEmail } from "../repositories/users";
import { hashPassword } from "../services/password";

/** `.invalid` never routes (RFC 2606): no email can reach this address, even by mistake. */
export const DEMO_EMAIL = "demo@demo.invalid";

/** Demo sessions last hours, not a month: data refreshes only on entry. */
export const DEMO_SESSION_MS = 6 * 60 * 60 * 1000;

export const isDemoEmail = (email: string) => email.trim().toLowerCase() === DEMO_EMAIL;

/** The demo account, made on first "Try the demo"; auth.ts treats its address as unknown. */
export async function findOrCreateDemoUser(): Promise<{ id: string; email: string }> {
  const existing = await findUserByEmail(DEMO_EMAIL);
  if (existing) return { id: existing.id, email: existing.email };
  try {
    const user = await createUserWithProfile(DEMO_EMAIL, await hashPassword(randomBytes(32).toString("hex")));
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
