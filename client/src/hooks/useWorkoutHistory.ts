import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

const PAGE_SIZE = 20;

/**
 * Sessions filtered by their SNAPSHOTTED day_name.
 *
 * A name shared across split eras — an old and a current "Lower" — deliberately
 * filters together, because to the user they are the same kind of day.
 */
export function useWorkoutHistory(dayName: string | null) {
  const { user } = useAuth();

  const query = useInfiniteQuery({
    queryKey: ["workoutHistory", user?.id ?? "anon", dayName],
    queryFn: ({ pageParam }) =>
      gymApi.getSessions({
        limit: PAGE_SIZE,
        offset: pageParam * PAGE_SIZE,
        ...(dayName ? { day_name: dayName } : {}),
      }),
    initialPageParam: 0,
    // A short page means the end; a full one might not, so keep offering more.
    getNextPageParam: (last, _all, lastParam) =>
      last.length < PAGE_SIZE ? undefined : lastParam + 1,
    enabled: !!user,
  });

  return {
    sessions: query.data?.pages.flat() ?? [],
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
  };
}

export function useHistoryDayNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["historyDayNames", user?.id ?? "anon"],
    queryFn: gymApi.dayNames,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
