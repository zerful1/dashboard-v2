import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { useHomeOverview } from "@/hooks/useHomeOverview";
import { profileQuery } from "@/lib/profileQuery";
import { TodayCard } from "@/features/home/TodayCard";
import { WeekTile } from "@/features/home/WeekTile";
import { WeightTile } from "@/features/home/WeightTile";
import { LastSessionCard } from "@/features/home/LastSessionCard";
import { TodayHabitsCard } from "@/features/habits/TodayHabitsCard";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

export function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useQuery(profileQuery);
  const { today, week, lastSession, weight, isLoading } = useHomeOverview();

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

      {isLoading ? (
        <Spinner label="Loading your overview" />
      ) : (
        <>
          <TodayCard today={today} />
          <TodayHabitsCard />

          {/* Two up from the smallest screen: these tiles are short enough that
              stacking them wastes the fold on a phone. */}
          <div className="grid grid-cols-2 gap-4">
            <WeightTile summary={weight} />
            <WeekTile week={week} />
          </div>

          {lastSession ? (
            <LastSessionCard session={lastSession} />
          ) : (
            <Card>
              <div className="lbl">No sessions yet</div>
              <p className="mt-2 text-sm text-muted">
                Log your first workout and it will show up here.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
