import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { foodApi, nutritionApi } from "@/api/nutrition";

export function useFoodSearch(q: string) {
  const { user } = useAuth();
  const term = q.trim();
  return useQuery({
    queryKey: ["foodSearch", user?.id ?? "anon", term],
    queryFn: () => foodApi.search(term),
    enabled: !!user && term.length >= 2,
    staleTime: 5 * 60_000,
    // Not worth persisting: one list per pause in typing, never reopened.
    meta: { persist: false },
  });
}

export function useRecents(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recents", user?.id ?? "anon"],
    queryFn: nutritionApi.recents,
    enabled: !!user && enabled,
  });
}
