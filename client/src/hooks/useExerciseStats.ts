import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { computeExerciseStats } from "@dashboard/shared";
import type { ExerciseStats } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

export function useExerciseStats(exerciseName: string | null): {
  stats: ExerciseStats | null;
  isLoading: boolean;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["workoutStats", user?.id ?? "anon", exerciseName],
    queryFn: () => gymApi.stats(exerciseName!),
    enabled: !!user && !!exerciseName,
    staleTime: 60_000,
  });

  // Computed in a useMemo over the query data rather than inside a callback.
  // A callback would capture the data from the render it was created in, and go
  // stale the moment the query refetched.
  const stats = useMemo(() => {
    if (!query.data) return null;
    return computeExerciseStats(
      query.data.sets,
      new Map(Object.entries(query.data.sessionDates)),
    );
  }, [query.data]);

  return { stats, isLoading: query.isLoading };
}

export function useHistoryExerciseNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["historyExerciseNames", user?.id ?? "anon"],
    queryFn: gymApi.historyExerciseNames,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
