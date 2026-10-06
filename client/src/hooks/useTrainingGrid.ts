import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { gridSince, trainingGrid, type SessionSummary, type TrainingGrid } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

/**
 * History's 12-week grid (redesign part 3b, §5): every session since the 84
 * days ending today. 100 is the endpoint's cap and more than 12 weeks can hold.
 */
export function useTrainingGrid(today: string): { grid: TrainingGrid<SessionSummary> | null; isPending: boolean } {
  const { user } = useAuth();
  const since = gridSince(today);
  const query = useQuery({
    queryKey: ["trainingGrid", user?.id ?? "anon", since],
    queryFn: () => gymApi.getSessions({ since, limit: 100 }),
    enabled: !!user,
    meta: { errorToast: false },
  });
  const grid = useMemo(() => (query.data ? trainingGrid(query.data, today) : null), [query.data, today]);
  return { grid, isPending: query.isPending };
}
