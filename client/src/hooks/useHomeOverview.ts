import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toLocalISO, deriveHome } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useSplit } from "@/hooks/useSplit";
import { useWeights } from "@/hooks/useWeights";
import { deriveWeightSummary } from "@/features/weight/deriveWeight";
import { gymApi } from "@/api/gym";

/**
 * One page-1 fetch of sessions covers both questions Home asks of them: which
 * days this week were trained, and what the last session was. A week is at most
 * 7 sessions, so 20 is comfortably enough for the window.
 *
 * The key deliberately does NOT match useWorkoutHistory's — that one is an
 * infinite query whose cache entry is an array of pages, a different shape.
 * Sharing the string would mean two hooks disagreeing about what is stored.
 */
const RECENT_LIMIT = 20;

export function useHomeOverview() {
  const { user } = useAuth();
  const { split, isPending: splitPending } = useSplit();
  const { entries, isPending: weightPending } = useWeights();

  const sessionsQuery = useQuery({
    queryKey: ["homeSessions", user?.id ?? "anon"],
    queryFn: () => gymApi.getSessions({ limit: RECENT_LIMIT }),
    enabled: !!user,
  });

  const today = toLocalISO();
  const sessions = sessionsQuery.data ?? [];

  const home = useMemo(() => deriveHome(split, sessions, today), [split, sessions, today]);
  const weight = useMemo(() => deriveWeightSummary(entries, today), [entries, today]);

  return {
    ...home,
    weight,
    // isPending everywhere, NOT isLoading. Two distinct traps:
    //
    // 1. While auth resolves, these queries are DISABLED, and a disabled query
    //    reports isLoading false in v5 (pending but not fetching). Home would
    //    render a complete overview built from DEFAULT_SPLIT and zero sessions
    //    - a real day name, "Not started", a Log button - then swap to the
    //    spinner and then to the truth.
    // 2. THE SPLIT MUST BE IN THE GATE. useSplit returns `data ?? DEFAULT_SPLIT`,
    //    so an unloaded split is indistinguishable from a default one. Today
    //    sessionsQuery covers it by accident; once the query cache is persisted
    //    a hydrated sessions query reports success - and isPending false - while
    //    still disabled, so Home could paint a day name from DEFAULT_SPLIT. On a
    //    customised split that is the WRONG day, not a harmless one.
    isLoading: splitPending || sessionsQuery.isPending || weightPending,
  };
}
