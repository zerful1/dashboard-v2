import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { insightsApi } from "@/api/insights";

// Each Insights section renders its own failure, so these opt out of the toast.

export function useWeeklyReview(week: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["insightsReview", user?.id ?? "anon", week],
    queryFn: () => insightsApi.review(week),
    enabled: !!user,
    meta: { errorToast: false },
  });
}

export function useRecords() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["insightsRecords", user?.id ?? "anon"],
    queryFn: insightsApi.records,
    enabled: !!user,
    meta: { errorToast: false },
  });
}
