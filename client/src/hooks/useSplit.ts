import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_SPLIT, type SplitConfig } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

export const splitKey = (userId: string) => ["split", userId] as const;

export function useSplit() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = splitKey(user?.id ?? "anon");

  const query = useQuery({
    queryKey: key,
    queryFn: gymApi.getSplit,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const saveSplit = useMutation({
    mutationFn: gymApi.saveSplit,
    onMutate: async (config: SplitConfig) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SplitConfig>(key);
      qc.setQueryData(key, config);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  // `split` is ALWAYS defined. The default covers the cold first paint as well
  // as a user who has never customised, so nothing downstream branches on
  // "loaded yet" and there is no flicker between two different day lists.
  //
  // Which is exactly why `isPending` is exposed and `isLoading` is not: an
  // unloaded split is INDISTINGUISHABLE from a default one, so any caller that
  // renders a day name has to know whether the real split has arrived. A
  // disabled query reports isLoading false, and a persisted-hydrated one
  // reports isPending false while still disabled - only isPending answers
  // "is there data yet" in both cases.
  return { split: query.data ?? DEFAULT_SPLIT, isPending: query.isPending, saveSplit };
}
