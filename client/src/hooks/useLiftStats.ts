import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { liftDetail, type LiftDetail, type LiftProgress } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

/** The Stats overview (redesign part 3b, §3): every lift's status as of `today`, worked out on the server. */
export function useLiftProgress(today: string): { lifts: LiftProgress[] | undefined; isPending: boolean; isError: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["liftProgress", user?.id ?? "anon", today],
    queryFn: () => gymApi.progress(today),
    enabled: !!user,
    // The tab says so itself when it fails.
    meta: { errorToast: false },
  });
  return { lifts: query.data, isPending: query.isPending, isError: query.isError };
}

/** One lift's detail (§4), from its sets, by the same rule as the overview. */
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
