import type { AuthUser } from "./AuthProvider";

const KEY = "dashboard-last-user";

/** Last signed-in user, so the app opens on its saved cache with no signal; not a credential. */
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
