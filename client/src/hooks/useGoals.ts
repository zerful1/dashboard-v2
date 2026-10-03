import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { insightsApi } from "@/api/insights";

/** Goals and their writes. Not optimistic: the server records each goal's start. */
export function useGoals() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["goals", user?.id ?? "anon"],
    queryFn: insightsApi.goals,
    enabled: !!user,
    // The section renders its own failure.
    meta: { errorToast: false },
  });
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
