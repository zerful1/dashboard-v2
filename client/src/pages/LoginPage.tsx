import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

export function LoginPage() {
  const { user, loading, login, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    setDemoBusy(true);
    try {
      await enterDemo();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the demo");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Track your training, food and habits."
      footer={
        <>
          No account? <Link to="/register" className="text-text underline underline-offset-4">Create one</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>

        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-muted hover:text-text">
            Forgotten your password?
          </Link>
        </div>
      </form>

      <div className="mt-6 border-t border-raised pt-4">
        <Button type="button" variant="ghost" loading={demoBusy} className="w-full" onClick={onDemo}>
          Try the demo
        </Button>
        <p className="mt-2 text-center text-xs text-muted">Browse with made-up data. Nothing can be changed.</p>
      </div>
    </AuthShell>
  );
}
