import { queryOptions, useQuery } from "@tanstack/react-query";
import type { LastTime } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

const NONE: Record<string, LastTime> = {};

/**
 * Last time for each exercise on a day's list (redesign part 3a, §4): the
 * newest session before `before` that has it, on any day. Sorted, so the same
 * list in another order is the same cache entry.
 */
export function lastTimesQueryOptions(userId: string, names: string[], before: string) {
  const sorted = [...names].sort();
  return queryOptions({
    queryKey: ["lastTimes", userId, before, ...sorted] as const,
    queryFn: () => gymApi.lastTimes(sorted, before),
    staleTime: 5 * 60 * 1000,
  });
}

/** `{}` until loaded, and for an empty list, which asks for nothing. */
export function useLastTimes(names: string[], before: string): Record<string, LastTime> {
  const { user } = useAuth();
  const { data } = useQuery({
    ...lastTimesQueryOptions(user?.id ?? "anon", names, before),
    enabled: !!user && names.length > 0,
  });
  return data ?? NONE;
}
