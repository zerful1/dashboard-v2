import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shiftISO, type DayTotal } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { nutritionApi } from "@/api/nutrition";

export const foodDaysKey = (userId: string, from: string, to: string) => ["foodDays", userId, from, to] as const;

/**
 * Each day's kcal and protein for Food's 7-day strip.
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
  // A device that reports online with no internet (dead wifi, a captive portal)
  // still fetches, and the fetch FAILS rather than pausing; placeholderData
  // (pending only) goes with it. Yesterday's window stands in for that too.
  const standIn = query.isError && query.data === undefined ? yesterday : undefined;
  return {
    days: query.data ?? standIn,
    isPending: query.isPending,
    isPlaceholder: query.isPlaceholderData || standIn !== undefined,
    // Failed with nothing to show: a failed refresh keeps the last good days.
    failed: query.isError && query.data === undefined && standIn === undefined,
  };
}
