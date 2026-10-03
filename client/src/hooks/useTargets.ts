import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { failOffline } from "@/lib/failOffline";
import { nutritionApi } from "@/api/nutrition";
import type { NutritionTarget, TargetInput } from "@dashboard/shared";

export const targetsKey = (userId: string) => ["targets", userId] as const;

export function useTargets({ errorToast = true }: { errorToast?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const key = targetsKey(userId);

  const query = useQuery({
    queryKey: key,
    queryFn: nutritionApi.targets,
    enabled: !!user,
    // false only for a caller that renders the failure itself (lib/queryClient.ts).
    meta: { errorToast },
  });

  const addTarget = useMutation({
    ...failOffline,
    mutationFn: nutritionApi.addTarget,
    onMutate: async (input: TargetInput) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NutritionTarget[]>(key);
      const optimistic: NutritionTarget = {
        ...input, id: `optimistic-${Date.now()}`, user_id: userId, created_at: new Date().toISOString(),
      };
      qc.setQueryData<NutritionTarget[]>(key, [optimistic, ...(previous ?? [])]);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["targets"] }),
  });

  return {
    targets: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    hasData: query.data !== undefined,
    refetch: query.refetch,
    addTarget,
  };
}
