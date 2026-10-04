import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { markDay, type HabitSummary } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useToday } from "@/hooks/useToday";
import { habitsApi } from "@/api/habits";

type Snapshot = { previous?: HabitSummary[] };

/**
 * Habits for Home and the Habits page. `today` is in the key, so the screens
 * roll over at midnight rather than showing yesterday's ticks as today's.
 */
export function useHabits() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = useToday();
  const key = ["habits", user?.id ?? "anon", today] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => habitsApi.list(today),
    enabled: !!user,
    // Both screens render their own failure.
    meta: { errorToast: false },
  });

  /**
   * CLAUDE.md's optimistic shape: onMutate snapshots and writes, onError only
   * rolls back (the MutationCache owns the message), onSettled refetches.
   */
  function optimistic<V>(run: (v: V) => Promise<unknown>, apply: (list: HabitSummary[], v: V) => HabitSummary[]) {
    return {
      mutationFn: run,
      onMutate: async (v: V): Promise<Snapshot> => {
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData<HabitSummary[]>(key);
        if (previous) qc.setQueryData<HabitSummary[]>(key, apply(previous, v));
        return { previous };
      },
      onError: (_e: unknown, _v: V, ctx: Snapshot | undefined) => {
        if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: ["habits"] });
      },
    };
  }

  const setDone = useMutation(
    optimistic(
      (v: { id: string; date: string; done: boolean }) => habitsApi.setDone(v.id, v.date, v.done),
      (list, v) => list.map((h) => (h.id === v.id ? markDay(h, v.date, v.done, today) : h)),
    ),
  );
  const add = useMutation(
    optimistic(
      (v: { name: string; emoji: string | null }) => habitsApi.add(v.name, v.emoji),
      (list, v) => [
        ...list,
        { id: `optimistic-${list.length}`, user_id: user?.id ?? "", name: v.name, emoji: v.emoji,
          sort_order: list.length + 1, created_at: "", streak: 0, recent: [] },
      ],
    ),
  );
  const rename = useMutation(
    optimistic(
      (v: { id: string; name?: string; emoji?: string | null }) => habitsApi.update(v.id, { name: v.name, emoji: v.emoji }),
      (list, v) =>
        list.map((h) =>
          h.id === v.id
            ? { ...h, ...(v.name !== undefined && { name: v.name }), ...(v.emoji !== undefined && { emoji: v.emoji }) }
            : h,
        ),
    ),
  );
  const remove = useMutation(optimistic((id: string) => habitsApi.remove(id), (list, id) => list.filter((h) => h.id !== id)));
  const reorder = useMutation(
    optimistic(
      (ids: string[]) => habitsApi.reorder(ids),
      (list, ids) => ids.map((id) => list.find((h) => h.id === id)).filter((h): h is HabitSummary => !!h),
    ),
  );

  return {
    habits: query.data ?? [],
    today,
    isPending: query.isPending,
    isError: query.isError,
    hasData: query.data !== undefined,
    refetch: query.refetch,
    setDone,
    add,
    rename,
    remove,
    reorder,
  };
}
