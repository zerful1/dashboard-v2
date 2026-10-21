import { queryOptions, useQuery } from "@tanstack/react-query";
import type { LastTime } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

const NONE: Record<string, LastTime> = {};

/**
 * Last time for each exercise on a day's list: the
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

/**
 * Last time by exercise name, and whether it is still on its way. "Not loaded
 * yet" must never read as "never done" (CLAUDE.md, isPending not isLoading), so
 * callers say nothing about last time while `isPending`. An empty list asks for
 * nothing and has nothing to wait for: a disabled query stays pending forever
 * in v5, so pending counts only while enabled.
 */
export function useLastTimes(names: string[], before: string): { byName: Record<string, LastTime>; isPending: boolean } {
  const { user } = useAuth();
  const enabled = !!user && names.length > 0;
  const query = useQuery({ ...lastTimesQueryOptions(user?.id ?? "anon", names, before), enabled });
  return { byName: query.data ?? NONE, isPending: enabled && query.isPending };
}
