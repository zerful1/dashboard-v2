import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

export function useHistoryExerciseNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["historyExerciseNames", user?.id ?? "anon"],
    queryFn: gymApi.historyExerciseNames,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
