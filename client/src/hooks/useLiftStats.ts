import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liftDetail, type LiftDetail, type LiftProgress } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { newestCached } from "@/lib/newestCached";

/** The Stats overview: every lift's status as of `today`, worked out on the server. */
export function useLiftProgress(today: string): { lifts: LiftProgress[] | undefined; isPending: boolean; isError: boolean } {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const query = useQuery({
    queryKey: ["liftProgress", userId, today],
    queryFn: () => gymApi.progress(today),
    enabled: !!user,
    // Keyed by day: offline on a new day, yesterday's overview stands in.
    placeholderData: () => newestCached<LiftProgress[]>(qc, ["liftProgress", userId]),
    // The tab says so itself when it fails.
    meta: { errorToast: false },
  });
  return { lifts: query.data, isPending: query.isPending, isError: query.isError };
}

/** One lift's detail, from its sets, by the same rule as the overview. */
export function useLiftDetail(name: string, today: string): { detail: LiftDetail | null; isPending: boolean; isError: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["workoutStats", user?.id ?? "anon", name],
    queryFn: () => gymApi.stats(name),
    enabled: !!user,
    staleTime: 60_000,
    meta: { errorToast: false },
  });
  // In a useMemo over the data, not a callback: a callback would keep the data
  // from the render it was made in and go stale on the next refetch.
  const detail = useMemo(() => (query.data ? liftDetail(name, query.data, today) : null), [query.data, name, today]);
  return { detail, isPending: query.isPending, isError: query.isError };
}
