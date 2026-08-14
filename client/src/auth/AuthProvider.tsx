import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first /me resolves — distinct from "signed out". */
  loading: boolean;
  /**
   * Set when the most recent `/me` check failed for a reason other than
   * "not signed in" — a non-401 `ApiError` (5xx, etc.) or a network-level
   * `TypeError` from `fetch` itself. `user` is left untouched when this is
   * set, so a consumer can tell "definitely signed out" (`user === null`,
   * `sessionError === null`) apart from "couldn't tell" (`sessionError` set).
   * Cleared back to `null` by the next `refreshAuth()` call that completes,
   * whether it lands on signed in or signed out. Narrow with
   * `instanceof ApiError` if you need the status code.
   */
  sessionError: Error | null;
  /** Rejects if the credentials are refused, or if no session was established. */
  login: (email: string, password: string) => Promise<void>;
  /** Rejects if the account can't be created, or if no session was established. */
  register: (email: string, password: string) => Promise<void>;
  /**
   * Never rejects: a failed sign-out still ends the session on this device and
   * reports itself with a toast, so callers do not need a rejection handler.
   */
  logout: () => Promise<void>;
  /**
   * Re-runs the `/me` check and returns the user it resolved, or `null` if the
   * check said signed-out or could not complete (see `sessionError` for which).
   * Returning the value rather than only writing it to state is what lets
   * `login`/`register` tell "the cookie stuck" from "it didn't" — the state
   * they'd otherwise have to read is a render behind.
   */
  refreshAuth: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * CACHE INVALIDATION ACROSS IDENTITIES — decided once here, inherited by every
 * query added later. Must be read before adding a query key.
 *
 * There are two ways to stop one account's cached data being served to the
 * next: clear the whole cache whenever the identity changes, or carry the user
 * id in every query key (`["profile", user.id]`). This codebase clears, in
 * `endSession` below and on the way into `login`/`register`.
 *
 * Why clearing: key scoping is opt-in per key, so the guarantee only holds
 * while every future key remembers the id — and a key that forgets fails
 * silently, showing the previous account's data with nothing to notice.
 * Clearing is one call at the one place identity can change, and it covers
 * keys written by people who never read this. Phase 4 adds a dozen keys
 * carrying far more than a timezone, so the guarantee has to hold by
 * construction rather than by everyone remembering.
 *
 * The cost is a cold cache after each sign-in: one refetch per mounted query,
 * on a screen the user has only just arrived at.
 *
 * All three transitions clear, not just sign-out — a sign-out whose POST never
 * landed, or a tab left open on a session that ended elsewhere, both leave the
 * previous account's data in the cache, and sign-in is where it would be handed
 * to somebody new.
 *
 * This is also why AuthProvider must be rendered inside QueryClientProvider.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  const refreshAuth = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const me = await api<AuthUser>("/api/auth/me");
      setUser(me);
      setSessionError(null);
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is the normal signed-out case, not an error worth surfacing.
        setUser(null);
        setSessionError(null);
      } else {
        // Non-401 ApiError (5xx, etc.) or a network-level TypeError from
        // fetch itself: we can't tell whether the session is actually gone,
        // so don't guess by clearing a user we already know about — record
        // the failure instead and let the caller decide what to do with it.
        setSessionError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // Everything that has to happen for this device to be signed out, in one
  // place so no caller can do half of it. See the cache note above.
  const endSession = useCallback(() => {
    qc.clear();
    setUser(null);
    setSessionError(null);
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      qc.clear();
      // The POST succeeding only proves the credentials were right; it does not
      // prove the browser kept the cookie. Without this check a session that
      // failed to stick resolves as success, the page navigates to "/",
      // ProtectedRoute finds no user and bounces straight back to /login — a
      // form that clears and does nothing, forever, with nothing said anywhere.
      const me = await refreshAuth();
      if (!me) throw new Error("Signed in, but the session did not stick on this device.");
    },
    [qc, refreshAuth],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      qc.clear();
      const me = await refreshAuth();
      if (!me) throw new Error("Account created, but the session did not stick on this device.");
    },
    [qc, refreshAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Deliberately still ends the session locally. The request may well have
      // destroyed the server-side session and failed on the way back, and even
      // if it didn't, leaving the user apparently signed in on a device they
      // asked to leave is the worse of the two wrong answers — the next
      // request's 401 settles it either way. Say so rather than failing
      // silently: both call sites are fire-and-forget, so this toast is the
      // only thing standing between a failed sign-out and no feedback at all.
      toast.error("Signed out on this device — the server did not confirm.");
    } finally {
      endSession();
    }
  }, [endSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, login, register, logout, refreshAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
