import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { insightsApi } from "@/api/insights";

/** The goals query, shared by useGoals and useWeightGoalKg so both read one cache entry. */
function goalsQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: ["goals", userId ?? "anon"],
    queryFn: insightsApi.goals,
    enabled: !!userId,
    // Insights renders its own failure; elsewhere a missing goal only leaves a
    // weight trend uncoloured, which needs no toast.
    meta: { errorToast: false },
  });
}

/**
 * The weight goal's target, or null. Only what a weight trend is coloured
 * against (trendTone): while it loads, or if it fails, trends stay neutral —
 * never wrongly green.
 */
export function useWeightGoalKg(): number | null {
  const { user } = useAuth();
  const { data } = useQuery(goalsQueryOptions(user?.id));
  return data?.find((g) => g.kind === "weight")?.target_kg ?? null;
}

/** Goals and their writes. Not optimistic: the server records each goal's start. */
export function useGoals() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const query = useQuery(goalsQueryOptions(user?.id));
  const settle = () => {
    void qc.invalidateQueries({ queryKey: ["goals"] });
    void qc.invalidateQueries({ queryKey: ["insightsProjections"] });
  };
  const setWeight = useMutation({ mutationFn: insightsApi.setWeightGoal, onSettled: settle });
  const addLift = useMutation({
    mutationFn: ({ exercise_name, target_kg }: { exercise_name: string; target_kg: number }) =>
      insightsApi.addLiftGoal(exercise_name, target_kg),
    onSettled: settle,
  });
  const remove = useMutation({ mutationFn: insightsApi.removeGoal, onSettled: settle });
  return {
    goals: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    hasData: query.data !== undefined,
    refetch: query.refetch,
    setWeight,
    addLift,
    remove,
  };
}

export function useProjections(today: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["insightsProjections", user?.id ?? "anon", today],
    queryFn: () => insightsApi.projections(today),
    enabled: !!user,
    meta: { errorToast: false },
  });
}
