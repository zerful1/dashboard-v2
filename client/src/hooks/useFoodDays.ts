import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shiftISO, type DayTotal } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { nutritionApi } from "@/api/nutrition";

export const foodDaysKey = (userId: string, from: string, to: string) => ["foodDays", userId, from, to] as const;

/**
 * Each day's kcal and protein for Food's 7-day strip (redesign part 4, §5).
 *
 * Keyed by its range, so each new day is a new key with nothing cached, and
 * offline that would wait behind the strip's empty state. While the strip ends
 * today, YESTERDAY's window stands in: exactly that window, never the newest
 * cached one, because the strip reads a day missing from its data as "nothing
 * logged" and any other window is missing days this one shows. Today, the one
 * day yesterday's window lacks, is flagged by `isPlaceholder`.
 */
export function useFoodDays(from: string, to: string, today: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const query = useQuery({
    queryKey: foodDaysKey(userId, from, to),
    queryFn: () => nutritionApi.days(from, to),
    enabled: !!user,
    placeholderData:
      to === today
        ? () => qc.getQueryData<DayTotal[]>(foodDaysKey(userId, shiftISO(from, -1), shiftISO(to, -1)))
        : undefined,
    // The strip says so itself when it fails.
    meta: { errorToast: false },
  });
  return {
    days: query.data,
    isPending: query.isPending,
    isPlaceholder: query.isPlaceholderData,
    // Failed with nothing to show: a failed refresh keeps the last good days.
    failed: query.isError && query.data === undefined,
  };
}
