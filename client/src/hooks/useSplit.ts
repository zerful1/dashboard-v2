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
    // Gym and Home each say so themselves when it fails.
    meta: { errorToast: false },
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

  // `split` is never undefined, so callers need isPending (not isLoading) and `failed` to tell it from a default.
  return {
    split: query.data ?? DEFAULT_SPLIT,
    isPending: query.isPending,
    failed: query.isError && query.data === undefined,
    refetch: query.refetch,
    saveSplit,
  };
}
