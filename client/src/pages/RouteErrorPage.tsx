import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/** The router's errorElement: a real document navigation, since a client-side link would keep the failed tree. */
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
