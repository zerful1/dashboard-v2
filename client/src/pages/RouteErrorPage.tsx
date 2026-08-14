import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * The router's `errorElement`, covering the whole tree: whatever a route throws
 * on the way to rendering lands here instead of on React Router's built-in
 * error screen, whose developer-facing help text is stripped in a production
 * build down to two unstyled lines with no way out.
 *
 * Deliberately minimal, and deliberately not `useRouteError()`: nothing it
 * could show the user about the underlying error is actionable. The one thing
 * that is — starting again from a known-good state — is a real document
 * navigation rather than a client-side link, because the tree that just failed
 * to render is the tree a client-side link would keep.
 *
 * Same shape as ProtectedRoute's "couldn't check your session" card on
 * purpose: one calm sentence and one control.
 */
export function RouteErrorPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Card className="w-full max-w-sm space-y-3 text-center">
        <p role="alert" className="text-sm leading-relaxed text-muted">
          This screen failed to load. Nothing you had saved has been lost.
        </p>
        <Button
          className="w-full"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Reload the app
        </Button>
      </Card>
    </div>
  );
}
