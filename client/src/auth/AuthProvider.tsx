import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const me = await api<AuthUser>("/api/auth/me");
      setUser(me);
      setSessionError(null);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await refreshAuth();
    },
    [refreshAuth],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refreshAuth();
    },
    [refreshAuth],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

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
