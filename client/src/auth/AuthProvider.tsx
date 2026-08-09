import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first /me resolves — distinct from "signed out". */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      setUser(await api<AuthUser>("/api/auth/me"));
    } catch {
      // 401 is the normal signed-out case, not an error worth surfacing.
      setUser(null);
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
