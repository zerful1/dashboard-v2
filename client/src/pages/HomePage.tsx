import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { profileQuery } from "@/lib/profileQuery";
import { Card } from "@/components/ui/Card";

export function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useQuery(profileQuery);

  // Three cases, one answer. `display_name` is `NOT NULL DEFAULT ''`, so a
  // freshly registered user has an empty one; the query may still be in flight
  // on first paint; and it may have failed outright. The email is the only
  // value guaranteed present in all three, and `||` (not `??`) is what makes
  // the empty-string case fall through as well as the missing one.
  const heading = profile?.display_name || user?.email;

  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Overview</div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">{heading}</h1>
      </div>

      <Card>
        <div className="lbl">Nothing here yet</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Gym, nutrition, habits and media arrive in the next phases. Your account
          and profile are live now — try{" "}
          {/* A real link, and not accent-coloured: a link is none of the three
              roles terracotta marks, and accent-coloured text that could not be
              clicked was reading as one anyway. Same demoted treatment as every
              other link in the app. */}
          <Link to="/settings" className="text-text underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
