import { Link } from "react-router-dom";

/** The catch-all inside the protected routes, so the nav and sign-out stay around a missing address. */
export function NotFoundPage() {
  return (
    <div className="max-w-lg space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm leading-relaxed text-muted">
        That address doesn&apos;t match anything in this app.{" "}
        <Link to="/" className="text-text underline underline-offset-4">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
