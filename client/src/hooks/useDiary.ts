import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { failOffline } from "@/lib/failOffline";
import { nutritionApi } from "@/api/nutrition";
import { invalidateNutritionReaders } from "@/hooks/invalidate";
import type { DiaryEntryInput, FoodLogEntry } from "@dashboard/shared";

/** User id AND date in the key: see weightKey on why identity is structural. */
export const diaryKey = (userId: string, date: string) => ["diary", userId, date] as const;

export function useDiary(date: string, { enabled = true }: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const key = diaryKey(userId, date);

  const query = useQuery({
    queryKey: key,
    queryFn: () => nutritionApi.diary(date),
    enabled: !!user && enabled,
  });

  const addEntry = useMutation({
    ...failOffline,
    mutationFn: nutritionApi.addEntry,
    onMutate: async (input: DiaryEntryInput) => {
      // Keyed on the entry's own date, which is the page's date in practice.
      const k = diaryKey(userId, input.date);
      await qc.cancelQueries({ queryKey: k });
      const previous = qc.getQueryData<FoodLogEntry[]>(k);
      const optimistic: FoodLogEntry = {
        id: `optimistic-${Date.now()}`,
        user_id: userId,
        date: input.date,
        logged_at: new Date().toISOString(),
        food_item_id: input.food_item_id ?? null,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        calories: input.calories,
        protein_g: input.protein_g,
        fat_g: input.fat_g,
        carbs_g: input.carbs_g,
        fibre_g: input.fibre_g,
        sugar_g: input.sugar_g,
        sat_fat_g: input.sat_fat_g,
        salt_g: input.salt_g,
      };
      qc.setQueryData<FoodLogEntry[]>(k, [...(previous ?? []), optimistic]);
      return { k, previous };
    },
    // Roll back only. The MutationCache default in App.tsx owns the message.
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.k, ctx.previous);
    },
    onSettled: () => invalidateNutritionReaders(qc),
  });

  const rescaleEntry = useMutation({
    ...failOffline,
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => nutritionApi.rescaleEntry(id, quantity),
    onMutate: async ({ id, quantity }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FoodLogEntry[]>(key);
      const scale = (v: number | null, k: number) => (v === null ? null : v * k);
      qc.setQueryData<FoodLogEntry[]>(
        key,
        (previous ?? []).map((e) => {
          if (e.id !== id) return e;
          const k = quantity / e.quantity;
          return {
            ...e, quantity,
            calories: e.calories * k, protein_g: e.protein_g * k, fat_g: e.fat_g * k, carbs_g: e.carbs_g * k,
            fibre_g: scale(e.fibre_g, k), sugar_g: scale(e.sugar_g, k),
            sat_fat_g: scale(e.sat_fat_g, k), salt_g: scale(e.salt_g, k),
          };
        }),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => invalidateNutritionReaders(qc),
  });

  const removeEntry = useMutation({
    ...failOffline,
    mutationFn: nutritionApi.removeEntry,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FoodLogEntry[]>(key);
      qc.setQueryData<FoodLogEntry[]>(key, (previous ?? []).filter((e) => e.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => invalidateNutritionReaders(qc),
  });

  // Not optimistic: the copy's contents come from the server. The sheet keeps
  // its button disabled while this is pending, so a double tap cannot copy twice.
  const copyDay = useMutation({
    ...failOffline,
    mutationFn: ({ from, to }: { from: string; to: string }) => nutritionApi.copyDay(from, to),
    onSettled: () => invalidateNutritionReaders(qc),
  });

  return {
    entries: query.data ?? [],
    // isPending, not isLoading: a disabled query reports isLoading false (CLAUDE.md).
    isPending: query.isPending,
    isError: query.isError,
    addEntry,
    rescaleEntry,
    removeEntry,
    copyDay,
  };
}
