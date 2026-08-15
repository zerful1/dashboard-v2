import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PASSWORD_MIN_LENGTH } from "@dashboard/shared";
import { api, ApiError } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

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
      // The footer follows the error, because a rejection here is nearly
      // always an expired or already-used token — the window is short, see
      // RESET_TTL_MINUTES in shared/src/policy.ts —
      // and "Back to sign in" sends a user who cannot sign in to the one page
      // that cannot help them. Same destination and wording as the
      // missing-token branch above, which is the same problem arriving
      // earlier.
      footer={
        error ? (
          <Link to="/forgot-password" className="text-text underline underline-offset-4">
            Request a new link
          </Link>
        ) : (
          <Link to="/login" className="text-text underline underline-offset-4">
            Back to sign in
          </Link>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="New password"
          htmlFor="password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
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
        {error && <FormError>{error}</FormError>}
        <Button type="submit" loading={busy} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
