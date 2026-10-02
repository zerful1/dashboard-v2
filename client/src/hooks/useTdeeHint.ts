import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { nutritionApi } from "@/api/nutrition";

export function useTdeeHint(today: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tdeeHint", user?.id ?? "anon", today],
    queryFn: () => nutritionApi.tdee(today),
    enabled: !!user && enabled,
  });
}
