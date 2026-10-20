import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { List } from "@/components/ui/List";

export function LoginPage() {
  const { user, loading, login, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      // The API returns one message for both wrong password and unknown email,
      // deliberately — do not try to be more helpful here.
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function onDemo() {
    setDemoError(null);
    setDemoBusy(true);
    try {
      await enterDemo();
      navigate("/", { replace: true });
    } catch (err) {
      setDemoError(err instanceof ApiError ? err.message : "Could not open the demo");
    } finally {
      setDemoBusy(false);
    }
  }

  // Most visitors are strangers (the CV links here), and sign-ups are closed, so
  // the demo is the one action; the form is the owner's, and a password manager
  // fills it (sign-in redesign, 2026-10-20).
  return (
    <AuthShell title="Track your training, food and habits" footer="Sign-ups are by invite only.">
      <Button type="button" loading={demoBusy} className="w-full" onClick={onDemo}>
        Try the demo
      </Button>
      <p className="mt-2 text-center text-xs text-muted">Browse with made-up data. Nothing can be changed.</p>
      {demoError && (
        <div className="mt-3">
          <FormError>{demoError}</FormError>
        </div>
      )}

      <List className="my-6">
        <Link to="/about" className="flex items-center gap-3 py-3">
          <span className="text-sm">About this project</span>
          <span className="flex-1 text-right text-xs text-muted">How it's built</span>
          {/* Decoration: the row is the link. */}
          <ChevronRight size={16} aria-hidden className="shrink-0 text-dim" />
        </Link>
      </List>

      <form onSubmit={onSubmit} aria-label="Sign in" className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" variant="ghost" loading={busy} className="w-full">
          Sign in
        </Button>

        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-muted hover:text-text">
            Forgotten your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
