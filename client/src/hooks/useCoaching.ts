import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

export function useCoaching(exerciseName: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["coaching", user?.id ?? "anon", exerciseName],
    queryFn: () => gymApi.coaching(exerciseName!),
    enabled: !!user && !!exerciseName,
  });
}
