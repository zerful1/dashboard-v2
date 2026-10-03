import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Exercise } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";
import { invalidateSessionReaders } from "./invalidate";

export const exercisesKey = (userId: string, dayType: number) =>
  ["exercises", userId, dayType] as const;

export function useExercises(dayType: number) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const key = exercisesKey(userId, dayType);

  const query = useQuery({
    queryKey: key,
    queryFn: () => gymApi.listExercises(dayType),
    enabled: !!user,
  });

  const addExercise = useMutation({
    mutationFn: (name: string) => gymApi.addExercise(dayType, name),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const deleteExercise = useMutation({
    mutationFn: gymApi.deleteExercise,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Exercise[]>(key) ?? [];
      qc.setQueryData(
        key,
        previous.filter((e) => e.id !== id),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => gymApi.reorderExercises(dayType, orderedIds),
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Exercise[]>(key) ?? [];
      // Reflect the requested order immediately — a reorder that visibly lags
      // reads as a failed tap and gets tapped again.
      const byId = new Map(previous.map((e) => [e.id, e]));
      qc.setQueryData(
        key,
        orderedIds.map((id) => byId.get(id)).filter(Boolean),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const renameExercise = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      gymApi.renameExercise(oldName, dayType, newName),
    // A rename touches EVERY day's template plus all history: it rewrites
    // exercise_name on every historical set, so the whole exercises tree AND
    // every reader of sessions and sets must refetch — not just this day's
    // key. Scoping this narrowly is how a renamed exercise ends up showing its
    // old name on another day until a refresh.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["exercises"] });
      void qc.invalidateQueries({ queryKey: ["exerciseNames"] });
      // Lift goals move with the rename on the server.
      void qc.invalidateQueries({ queryKey: ["goals"] });
      invalidateSessionReaders(qc);
    },
  });

  return {
    exercises: query.data ?? [],
    isLoading: query.isLoading,
    addExercise,
    deleteExercise,
    reorder,
    renameExercise,
  };
}
