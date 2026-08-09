import { hash, verify } from "@node-rs/argon2";

// OWASP's recommended argon2id parameters.
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    // A malformed stored hash must read as "wrong password", never as a 500.
    return false;
  }
}

/**
 * A real argon2id hash of a throwaway value, verified against when a login email is
 * unknown.
 *
 * Without it, login returns in about a millisecond for an address that does not
 * exist and about a hundred for one that does — which tells an attacker exactly
 * which emails are registered, defeating the care taken over enumeration in the
 * register and forgot-password responses.
 *
 * A module-level constant rather than a lazily-computed cache: no mutable module
 * state, so concurrent serverless invocations cannot race on it.
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$QIvAz7f3FVT4NVkimb8dUw$1DSwh3LefNcRy0ZC09afw+AKsc1GhUv2w6blcWkw31I";
