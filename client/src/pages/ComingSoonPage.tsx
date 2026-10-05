import { Link, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "@/layout/navItems";
import { Card } from "@/components/ui/Card";

/**
 * The catch-all inside the protected routes. Most of the navigation points at
 * sections that are not built yet — deliberately, so the app's shape is
 * visible from the first release — and this is what those destinations render.
 *
 * It is a route like any other, so the nav rail, tab bar and sign-out are all
 * still there. That is the whole point: without it React Router falls back to
 * its own error screen, which in a production build is two unstyled lines with
 * no navigation and no way back.
 */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to === pathname);

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <div className="lbl text-accent">{item ? item.label : "Nothing here"}</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          {item ? `${item.label} isn't built yet` : "No such page"}
        </h1>
      </div>

      <Card>
        <div className="lbl">{item ? "Coming soon" : pathname}</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {item
            ? "Media arrives in a later phase. The tab is here already so the shape of the app is honest about what is coming."
            : "That address does not match anything in this app. It may be a mistyped link, or a page that has since moved."}{" "}
          <Link to="/" className="text-text underline underline-offset-4">
            Back to the overview
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
