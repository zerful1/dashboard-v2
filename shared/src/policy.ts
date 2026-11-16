// Auth policy both halves must agree on: user-visible copy interpolates these, never spells the number.


/** Enforced by the server; stated by every "new password" field's hint. */
export const PASSWORD_MIN_LENGTH = 8;

/** Guards against a pathological input reaching argon2, not a policy users meet. */
export const PASSWORD_MAX_LENGTH = 200;

/** How long a password-reset link stays valid. */
export const RESET_TTL_MINUTES = 30;

/** Daily habits per user: enough for a routine, few enough to tick from Home. */
export const MAX_HABITS = 12;
