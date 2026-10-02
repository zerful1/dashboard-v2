/**
 * Who may create an account, from SIGNUP_ALLOWLIST:
 *
 *   unset or empty    nobody new - the production default
 *   *                 anyone - the test suite, and local development by choice
 *   a@x.com,b@y.com   only those addresses, e.g. to create a demo account
 *
 * Closed unless told otherwise, so an environment that is missing the variable
 * cannot reopen sign-ups by accident. Holding other people's weight, diet and
 * training data would bring legal duties this app is not set up for; the limit
 * is deliberate, not technical.
 */
export type SignupPolicy = { open: true } | { open: false; allow: ReadonlySet<string> };

export function parseSignupPolicy(raw: string | undefined): SignupPolicy {
  const value = (raw ?? "").trim();
  if (value === "*") return { open: true };
  return {
    open: false,
    allow: new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}

export function signupAllowed(policy: SignupPolicy, email: string): boolean {
  return policy.open || policy.allow.has(email.trim().toLowerCase());
}
