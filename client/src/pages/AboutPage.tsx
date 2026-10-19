import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormError } from "@/components/ui/FormError";
import { PILL } from "@/components/ui/pill";

const DOES = [
  "Logs gym sessions set by set, and suggests the next set from your history",
  "Tracks body weight with a trend line and a projected goal date",
  "Logs food by search or barcode against calorie and protein targets",
  "Reviews each week, and keeps daily habits",
];

const STACK = ["TypeScript", "React 19", "TanStack Query", "Tailwind 4", "Node · Express", "PostgreSQL · Supabase", "Vitest", "Vercel"];

const WORTH_A_LOOK = [
  "Every query is scoped to its user, with an ownership test per table",
  "Works offline from a per-user cache; a failed save says so instead of vanishing",
  "The demo is kept read-only by the server, not just the buttons",
  "Dates stay as plain strings end to end, so daylight saving can't shift a day",
];

/**
 * The project page (housekeeping spec §5): public, beside /login and outside
 * ProtectedRoute, for someone arriving from a link rather than to use the app.
 * It reads only the session, so a signed-out visit makes no other request.
 */
export function AboutPage() {
  const { user, loading, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDemo() {
    setError(null);
    setDemoBusy(true);
    try {
      await enterDemo();
      // Pushed, not replaced as the login page does: Back returns here.
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the demo");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <div className="lbl">Project info</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm leading-relaxed text-text">
        A personal tracker for training, body weight, food and habits: my own single-user app, rebuilt as a full-stack,
        multi-user web app.
      </p>

      {/* Empty while the session is checked, at its own height: a signed-in
          visitor must not see the demo flash before "Open the app". A check
          that failed outright offers the signed-out actions, as /login does. */}
      <div className="mt-5 flex min-h-11 flex-wrap gap-2">
        {loading ? null : user ? (
          <Link to="/" className={cn(PILL, "bg-accent px-4 py-2.5 text-bg hover:brightness-90")}>
            Open the app
          </Link>
        ) : (
          <>
            <Button loading={demoBusy} onClick={onDemo}>
              Try the demo
            </Button>
            <Link to="/login" className={cn(PILL, "border border-edge px-4 py-2.5 text-text hover:bg-accent/5")}>
              Sign in
            </Link>
          </>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}

      <Card className="mt-6">
        <h2 className="lbl">What it does</h2>
        <Bullets items={DOES} />
      </Card>

      <Card className="mt-6">
        <h2 className="lbl">Built with</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {STACK.map((s) => (
            <li key={s} className="rounded-full border border-edge px-3 py-1 text-xs text-text">
              {s}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6">
        <h2 className="lbl">Worth a look</h2>
        <Bullets items={WORTH_A_LOOK} />
      </Card>

      <Card className="mt-6">
        <h2 className="lbl">How it was built</h2>
        <p className="mt-2 text-sm leading-relaxed text-text">
          Designed and directed by me, built with Claude Code as an AI pair programmer. Every change started as a written
          spec, was built test-first and reviewed before merging.
        </p>
      </Card>
    </main>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-text">
          {/* Decoration: a 4 px dot, centred on the first line. */}
          <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-dim" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
