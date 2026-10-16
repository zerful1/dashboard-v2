import { Link } from "react-router-dom";

/**
 * The catch-all inside the protected routes: an address that matches no page.
 *
 * It is a route like any other, so the nav rail, tab bar and sign-out are all
 * still there. That is the whole point: without it React Router falls back to
 * its own error screen, which in a production build is two unstyled lines with
 * no navigation and no way back.
 */
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
