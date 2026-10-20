import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PASSWORD_MIN_LENGTH } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

export function RegisterPage() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await register(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
      setError(err instanceof ApiError ? err.message : "Could not create that account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Sign-ups are by invite only. Your data is private to you."
      footer={
        <>
          Already have one? <Link to="/login" className="text-text underline underline-offset-4">Sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fieldErrors.password}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && Object.keys(fieldErrors).length === 0 && <FormError>{error}</FormError>}

        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
