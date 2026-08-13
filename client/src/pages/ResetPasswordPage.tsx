import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthShell
        title="Link is incomplete"
        subtitle="That reset link is missing its token. Request a new one."
        footer={
          <Link to="/forgot-password" className="text-text underline underline-offset-4">
            Request a new link
          </Link>
        }
      />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      // Every session was invalidated server-side, so sign in fresh.
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="This signs you out everywhere else."
      footer={
        <Link to="/login" className="text-text underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
