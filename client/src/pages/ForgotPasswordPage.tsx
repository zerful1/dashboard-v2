import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { AuthShell } from "@/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallowed on purpose. The confirmation below is shown unconditionally,
      // matching the endpoint's unconditional 204 — whether or not the
      // account exists. Surfacing this failure (or even letting it become an
      // unhandled rejection) would undo the server's enumeration defence by
      // giving an attacker a signal the success path doesn't have.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If an account exists for ${email}, a reset link is on its way. The link expires in an hour.`}
        footer={
          <Link to="/login" className="text-text underline underline-offset-4">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link."
      footer={
        <Link to="/login" className="text-text underline underline-offset-4">
          Back to sign in
        </Link>
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
        <Button type="submit" loading={busy} className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
