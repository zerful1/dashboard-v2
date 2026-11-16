/** Who may register, from SIGNUP_ALLOWLIST: unset = nobody (a missing variable must not reopen), * = all. */
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
