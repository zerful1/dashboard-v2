import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardioEntry } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi, type CardioInput } from "@/api/gym";
import { invalidateSessionReaders } from "./invalidate";

export function useCardio(sessionId: string | null, date: string, dayType: number) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["cardio", user?.id ?? "anon", sessionId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => gymApi.listCardio(sessionId!),
    // No session means no cardio yet — do not fetch with a null id.
    enabled: !!user && !!sessionId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cardio"] });
    // Adding cardio can CREATE the session, so everything that reads sessions
    // must refetch — the session id this hook is keyed by did not exist a
    // moment ago. Not just workoutDay: Home, History and the rest-day fallback
    // all read the row that just appeared.
    invalidateSessionReaders(qc);
  };

  const addCardio = useMutation({
    mutationFn: (fields: CardioInput) => gymApi.addCardio(date, dayType, fields),
    onSettled: invalidate,
  });

  const updateCardio = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: CardioInput }) =>
      gymApi.updateCardio(id, fields),
    onSettled: invalidate,
  });

  const deleteCardio = useMutation({
    mutationFn: gymApi.deleteCardio,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CardioEntry[]>(key) ?? [];
      qc.setQueryData(
        key,
        previous.filter((e) => e.id !== id),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: invalidate,
  });

  return { entries: query.data ?? [], addCardio, updateCardio, deleteCardio };
}
