import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { persister } from "@/lib/persister";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { forgetSavedUser, readSavedUser, saveUser } from "./savedUser";

/** The check never reached the server (no signal, or api() timed out); a 5xx is an answer, not this. */
const unreachable = (err: unknown) => !(err instanceof ApiError) || err.status === 0;

export interface AuthUser {
  id: string;
  email: string;
  /** True only in the read-only demo (server-set). */
  demo: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the first /me resolves — distinct from "signed out". */
  loading: boolean;
  /** Set when the latest `/me` failed for a reason other than 401, so "couldn't tell" differs from signed out. */
  sessionError: Error | null;
  /** Rejects if the credentials are refused, or if no session was established. */
  login: (email: string, password: string) => Promise<void>;
  /** Rejects if the account can't be created, or if no session was established. */
  register: (email: string, password: string) => Promise<void>;
  /** Signs in to the read-only demo. Rejects like `login`. */
  enterDemo: () => Promise<void>;
  /** Never rejects: a failed sign-out still ends the session here and toasts. */
  logout: () => Promise<void>;
  /** Re-runs `/me` and returns the resolved user (null if signed out or failed), since state lags a render. */
  refreshAuth: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Identity changes clear the whole query cache, memory and persisted, instead of scoping every key. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  // Readable by the cache listener without waiting a render: state still names the user one pass after a 401.
  const signedIn = useRef(false);
  // True while the user on screen is the remembered one, not server-confirmed (opened with no signal).
  const unconfirmed = useRef(false);

  const refreshAuth = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const me = await api<AuthUser>("/api/auth/me");
      signedIn.current = true;
      unconfirmed.current = false;
      // Remembered for a start with no signal (savedUser.ts).
      saveUser(me);
      setUser(me);
      setSessionError(null);
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is the signed-out case, and how a session ended elsewhere is found out: purge both cache copies.
        signedIn.current = false;
        unconfirmed.current = false;
        qc.clear();
        void persister.removeClient();
        forgetSavedUser();
        setUser(null);
        setSessionError(null);
      } else if (unreachable(err) && (signedIn.current || readSavedUser())) {
        // No answer from the server: open on the remembered user's saved data until a request settles it.
        if (!signedIn.current) {
          signedIn.current = true;
          unconfirmed.current = true;
          setUser(readSavedUser());
        }
        setSessionError(null);
      } else {
        // A 5xx or nobody remembered: can't tell if the session is gone, so keep the user and record the failure.
        setSessionError(err instanceof Error ? err : new Error(String(err)));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [qc]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // Signal is back on a device opened without it: ask /me now, only when the user is the remembered one.
  useEffect(() => {
    const onOnline = () => {
      if (unconfirmed.current) void refreshAuth();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshAuth]);

  // A 401 while signed in may mean the session ended elsewhere: ask /me, one check at a time.
  useEffect(() => {
    let checking = false;
    const onError = (err: unknown) => {
      if (!(err instanceof ApiError) || err.status !== 401 || !signedIn.current || checking) return;
      checking = true;
      void refreshAuth().finally(() => {
        checking = false;
      });
    };
    const offQueries = qc.getQueryCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error") onError(e.action.error);
    });
    const offWrites = qc.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error") onError(e.action.error);
    });
    return () => {
      offQueries();
      offWrites();
    };
  }, [qc, refreshAuth]);

  // Everything signing out needs, in one place so no caller does half of it.
  const endSession = useCallback(() => {
    qc.clear();
    // clear() empties memory only; the persisted copy must go too, or one user's data stays on disk.
    void persister.removeClient();
    forgetSavedUser();
    signedIn.current = false;
    unconfirmed.current = false;
    setUser(null);
    setSessionError(null);
  }, [qc]);

  // Forget the remembered user on the way into a new identity, so a dropped signal can't open as them.
  const forgetIdentity = useCallback(() => {
    forgetSavedUser();
    signedIn.current = false;
    unconfirmed.current = false;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      qc.clear();
      // clear() never touches the persisted copy, and signing in as someone else is an identity change.
      void persister.removeClient();
      forgetIdentity();
      // A successful POST doesn't prove the cookie stuck; without this check the form loops back to /login.
      const me = await refreshAuth();
      if (!me) throw new Error("Signed in, but the session did not stick on this device.");
    },
    [qc, refreshAuth, forgetIdentity],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      qc.clear();
      // Same reason as endSession.
      void persister.removeClient();
      forgetIdentity();
      const me = await refreshAuth();
      if (!me) throw new Error("Account created, but the session did not stick on this device.");
    },
    [qc, refreshAuth, forgetIdentity],
  );

  const enterDemo = useCallback(async () => {
    await api("/api/auth/demo", { method: "POST" });
    qc.clear();
    // Same reason as login: a new identity, so neither copy of the cache may survive.
    void persister.removeClient();
    forgetIdentity();
    const me = await refreshAuth();
    if (!me) throw new Error("Opened the demo, but the session did not stick on this device.");
  }, [qc, refreshAuth, forgetIdentity]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Ends the session locally even on failure, since the next 401 settles it; the toast is the only feedback.
      toast.error("Signed out on this device — the server did not confirm.");
    } finally {
      endSession();
    }
  }, [endSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, login, register, enterDemo, logout, refreshAuth }}
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
