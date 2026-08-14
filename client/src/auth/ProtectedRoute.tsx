import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, sessionError, refreshAuth } = useAuth();
  const location = useLocation();

  // Distinguishing "still checking" from "signed out" matters: rendering the
  // redirect during the first /me would bounce every returning user to /login
  // before their session had a chance to resolve.
  if (loading) return <Spinner label="Checking your session" />;

  // A non-401 failure means the check itself is broken — a 500, a database
  // outage, a DNS failure — not that the user is signed out. Treating
  // "couldn't tell" as "signed out" would silently bounce an authenticated
  // user to /login on a transient server error: invisible in local dev,
  // where nothing fails, and constant in production on a cold serverless
  // invocation. So this branch neither redirects nor renders the protected
  // content — it offers a way to check again.
  if (sessionError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5 py-10">
        <Card className="w-full max-w-sm space-y-3 text-center">
          {/* role="alert" like every other inline error here. The case it is
              for is the second failure: "Try again" fails again, the card
              re-renders identically, and without a live region nothing at all
              is announced to say the retry has been and gone. */}
          <p role="alert" className="text-sm leading-relaxed text-muted">
            Something went wrong reaching the server. We couldn&apos;t check your session.
          </p>
          <Button className="w-full" onClick={() => void refreshAuth()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}
