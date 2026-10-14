import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { insightsApi } from "@/api/insights";

/** The goals query, shared by useGoals, useHomeDay and the Weight page so all read one cache entry. */
export function goalsQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: ["goals", userId ?? "anon"],
    queryFn: insightsApi.goals,
    enabled: !!userId,
    // Insights and Weight render their own failure; on Home a missing goal only
    // leaves a weight trend uncoloured, which needs no toast.
    meta: { errorToast: false },
  });
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
    /** Waiting for a signal: offline with nothing saved, so it may stay pending a long time. */
    isPaused: query.isPaused,
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
