import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { weightApi, type WeightInput } from "@/api/weight";
import { invalidateInsightsReaders } from "./invalidate";
import type { BodyWeightEntry } from "@dashboard/shared";

/**
 * The cache key carries the user id.
 *
 * Phase 2 shipped a cross-account leak because `["profile"]` carried no
 * identity and outlived a sign-out: the next account in the same tab was served
 * the previous one's row. That was fixed by clearing the cache on every
 * identity transition, which works but depends on the clear firing. Scoping the
 * key structurally closes the same hole by construction — there is no cache
 * entry another user could read even if a clear were missed.
 */
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

      // POST upserts on (user_id, date), so an existing day is replaced rather
      // than duplicated. The optimistic write models that: filter the day out
      // and prepend. Appending instead would briefly render two rows for one
      // day, and the row that vanished on settle would look like a bug.
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
    // Roll back only. The global MutationCache handler (lib/queryClient.ts) owns the
    // message, so per-hook handlers never touch UI — one failure, one message.
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      invalidateInsightsReaders(qc);
      // A weigh-in moves the adaptive TDEE estimate (#17 review 16).
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
      // A weigh-in moves the adaptive TDEE estimate (#17 review 16).
      void qc.invalidateQueries({ queryKey: ["tdeeHint"] });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    // For callers that render derived values rather than a bare list: a disabled
    // query reports isLoading false, so isLoading alone lets a page paint
    // conclusions drawn from an empty array. See useHomeDay.
    isPending: query.isPending,
    isError: query.isError,
    saveWeight,
    deleteWeight,
  };
}
