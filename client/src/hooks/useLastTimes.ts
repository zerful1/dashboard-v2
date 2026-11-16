import { queryOptions, useQuery } from "@tanstack/react-query";
import type { LastTime } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

const NONE: Record<string, LastTime> = {};

/** Last time per exercise: the newest session before `before` that has it, on any day; sorted for a stable key. */
export function lastTimesQueryOptions(userId: string, names: string[], before: string) {
  const sorted = [...names].sort();
  return queryOptions({
    queryKey: ["lastTimes", userId, before, ...sorted] as const,
    queryFn: () => gymApi.lastTimes(sorted, before),
    staleTime: 5 * 60 * 1000,
  });
}

/** Last time by name; callers say nothing while `isPending`, which counts only while enabled (disabled never settles). */
export function useLastTimes(names: string[], before: string): { byName: Record<string, LastTime>; isPending: boolean } {
  const { user } = useAuth();
  const enabled = !!user && names.length > 0;
  const query = useQuery({ ...lastTimesQueryOptions(user?.id ?? "anon", names, before), enabled });
  return { byName: query.data ?? NONE, isPending: enabled && query.isPending };
}
