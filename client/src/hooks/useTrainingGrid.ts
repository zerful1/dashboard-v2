import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gridSince, trainingGrid, type SessionSummary, type TrainingGrid } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { newestCached } from "@/lib/newestCached";

/**
 * History's 12-week grid (redesign part 3b, §5): every session since the 84
 * days ending today. 100 is the endpoint's cap and more than 12 weeks can hold.
 */
export function useTrainingGrid(today: string): { grid: TrainingGrid<SessionSummary> | null; isPending: boolean } {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const since = gridSince(today);
  const query = useQuery({
    queryKey: ["trainingGrid", userId, since],
    queryFn: () => gymApi.getSessions({ since, limit: 100 }),
    enabled: !!user,
    // Keyed by the first day, which moves daily: offline on a new day,
    // yesterday's sessions stand in. Its window starts earlier, so it covers
    // today's grid, up to when it was fetched.
    placeholderData: () => newestCached<SessionSummary[]>(qc, ["trainingGrid", userId]),
    meta: { errorToast: false },
  });
  const grid = useMemo(() => (query.data ? trainingGrid(query.data, today) : null), [query.data, today]);
  return { grid, isPending: query.isPending };
}
