/**
 * Auth policy values that both halves of the app must agree on.
 *
 * These live here rather than as literals because each one used to be written
 * down in several places at once: the password minimum in three zod schemas,
 * three hint strings and a submit gate; the reset window in the token TTL, the
 * email body and two pieces of page copy. Duplicated policy drifts, and it
 * drifts silently — the failure is a screen still promising something the
 * server stopped doing, which no test and no type check can see.
 *
 * Anything user-visible that states one of these numbers should interpolate it
 * from here rather than spelling it out.
 */

/** Enforced by the server; stated by every "new password" field's hint. */
export const PASSWORD_MIN_LENGTH = 8;

/** Guards against a pathological input reaching argon2, not a policy users meet. */
export const PASSWORD_MAX_LENGTH = 200;

/**
 * How long a password-reset link stays valid.
 *
 * 30 minutes rather than the original hour: at this scale the marginal security
 * difference between 15 and 30 is close to nil, while the usability difference
 * is not — email delivery alone can eat a couple of minutes. An expired link is
 * not a dead end either way, since the reset screen routes straight to
 * "Request a new link".
 */
export const RESET_TTL_MINUTES = 30;
