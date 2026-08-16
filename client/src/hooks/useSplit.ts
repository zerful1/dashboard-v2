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

  // ALWAYS defined. The default covers the cold first paint as well as a user
  // who has never customised, so nothing downstream branches on "loaded yet"
  // and there is no flicker between two different day lists.
  return { split: query.data ?? DEFAULT_SPLIT, isLoading: query.isLoading, saveSplit };
}
