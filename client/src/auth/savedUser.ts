import type { AuthUser } from "./AuthProvider";

const KEY = "dashboard-last-user";

/**
 * Who was last signed in on this device, kept so the app can open on its saved
 * data when the server can't be reached to ask (AuthProvider).
 *
 * Not a credential: an id, an email and a flag, beside a query cache that
 * already holds that person's data. It grants nothing. The session cookie is
 * still what the server believes, and the first request to reach it decides.
 * It lives and dies with that cache: written when `/me` answers, removed
 * wherever the cache is purged.
 *
 * Every access is guarded. Storage can be missing, blocked or full, and the
 * app must start the same without it.
 */
export function readSavedUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Partial<AuthUser> | null;
    if (!u || typeof u.id !== "string" || !u.id || typeof u.email !== "string") return null;
    return { id: u.id, email: u.email, demo: u.demo === true };
  } catch {
    return null;
  }
}

export function saveUser(user: AuthUser): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ id: user.id, email: user.email, demo: user.demo === true }));
  } catch {
    // No storage: the next start with no signal shows the retry card, as before.
  }
}

export function forgetSavedUser(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
