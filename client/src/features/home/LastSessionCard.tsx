import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { WorkoutSession } from "@dashboard/shared";
import { setShort } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { prettyDate } from "@/lib/dates";

export function LastSessionCard({ session }: { session: WorkoutSession }) {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["sessionDetail", user?.id ?? "anon", session.id],
    queryFn: () => gymApi.sessionDetail(session.id),
    enabled: !!user,
  });

  const sets = data?.sets ?? [];

  // The heaviest set of each of the first two exercises, in the order they were
  // performed — a glance at what the session actually was, not a full listing.
  const byExercise = new Map<string, typeof sets>();
  for (const s of sets) {
    const list = byExercise.get(s.exercise_name) ?? [];
    list.push(s);
    byExercise.set(s.exercise_name, list);
  }
  const highlights = [...byExercise.entries()].slice(0, 2).map(([name, group]) => ({
    name,
    best: group.reduce((a, b) => (b.weight_kg > a.weight_kg ? b : a)),
  }));

  return (
    <Link to="/gym" className="block rounded-card border border-raised bg-surface p-4">
      <div className="lbl">Last session</div>
      <div className="mt-1 text-sm font-semibold">
        {/* The SNAPSHOTTED name, rendered directly. Resolving it through
            getDayName would relabel history whenever the split is edited,
            which is exactly what snapshotting exists to prevent. */}
        {prettyDate(session.date)} · {session.day_name}
        {sets.length > 0 && (
          <span className="font-normal text-muted"> · {sets.length} sets</span>
        )}
      </div>
      {highlights.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {highlights.map((h) => (
            <span key={h.name} className="truncate">
              <span className="text-text">{h.name}</span>{" "}
              <span className="tnum">{setShort(h.best)}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
