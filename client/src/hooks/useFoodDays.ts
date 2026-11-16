import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shiftISO, type DayTotal } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { nutritionApi } from "@/api/nutrition";

export const foodDaysKey = (userId: string, from: string, to: string) => ["foodDays", userId, from, to] as const;

/** Food's 7-day strip; yesterday's exact window stands in, since any other makes the strip show empty days. */
export function useFoodDays(from: string, to: string, today: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const yesterday =
    to === today ? qc.getQueryData<DayTotal[]>(foodDaysKey(userId, shiftISO(from, -1), shiftISO(to, -1))) : undefined;
  const query = useQuery({
    queryKey: foodDaysKey(userId, from, to),
    queryFn: () => nutritionApi.days(from, to),
    enabled: !!user,
    placeholderData: yesterday ? () => yesterday : undefined,
    // The strip says so itself when it fails.
    meta: { errorToast: false },
  });
  // Online with no internet, the fetch fails rather than pauses, so yesterday's window stands in for that too.
  const standIn = query.isError && query.data === undefined ? yesterday : undefined;
  return {
    days: query.data ?? standIn,
    isPending: query.isPending,
    isPlaceholder: query.isPlaceholderData || standIn !== undefined,
    // Failed with nothing to show: a failed refresh keeps the last good days.
    failed: query.isError && query.data === undefined && standIn === undefined,
  };
}
