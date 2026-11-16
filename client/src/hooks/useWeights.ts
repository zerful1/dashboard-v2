import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { weightApi, type WeightInput } from "@/api/weight";
import { invalidateInsightsReaders } from "./invalidate";
import type { BodyWeightEntry } from "@dashboard/shared";

/** The cache key carries the user id, so no entry another user could read exists even if a clear misfires. */
export const weightKey = (userId: string) => ["weight", userId] as const;

export function useWeights() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = weightKey(user?.id ?? "anon");

  const query = useQuery({
    queryKey: key,
    queryFn: weightApi.list,
    enabled: !!user,
  });

  const saveWeight = useMutation({
    mutationFn: weightApi.save,
    onMutate: async (input: WeightInput) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BodyWeightEntry[]>(key) ?? [];

      // POST upserts on (user_id, date): filter the day out and prepend, or one day briefly shows two rows.
      const optimistic: BodyWeightEntry = {
        id: previous.find((e) => e.date === input.date)?.id ?? `optimistic-${input.date}`,
        user_id: user?.id ?? "",
        date: input.date,
        weight_kg: input.weight_kg,
        notes: input.notes ?? null,
        created_at: new Date().toISOString(),
      };

      qc.setQueryData<BodyWeightEntry[]>(
        key,
        [optimistic, ...previous.filter((e) => e.date !== input.date)].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      );

      return { previous };
    },
    // Roll back only: the global MutationCache handler owns the message, so one failure gives one message.
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      invalidateInsightsReaders(qc);
      // A weigh-in moves the adaptive TDEE estimate.
      void qc.invalidateQueries({ queryKey: ["tdeeHint"] });
    },
  });

  const deleteWeight = useMutation({
    mutationFn: weightApi.remove,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BodyWeightEntry[]>(key) ?? [];
      qc.setQueryData<BodyWeightEntry[]>(
        key,
        previous.filter((e) => e.id !== id),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      invalidateInsightsReaders(qc);
      // A weigh-in moves the adaptive TDEE estimate.
      void qc.invalidateQueries({ queryKey: ["tdeeHint"] });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    // For derived values: a disabled query reports isLoading false, so gate on isPending. See useHomeDay.
    isPending: query.isPending,
    isError: query.isError,
    hasData: query.data !== undefined,
    saveWeight,
    deleteWeight,
  };
}
