import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkoutSession, WorkoutSet } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi, type SetFields } from "@/api/gym";
import { invalidateSessionReaders } from "./invalidate";

export const workoutDayKey = (userId: string, dayType: number, date: string) =>
  ["workoutDay", userId, dayType, date] as const;

/** One (day, date)'s session and its sets, shared with Home; no session yet is a normal state. */
export function workoutDayQueryOptions(userId: string, dayType: number, date: string) {
  return queryOptions({
    queryKey: workoutDayKey(userId, dayType, date),
    queryFn: async (): Promise<{ session: WorkoutSession | null; sets: WorkoutSet[] }> => {
      const s = await gymApi.getSession(date, dayType);
      return s ? { session: s, sets: await gymApi.listSets(s.id) } : { session: null, sets: [] };
    },
  });
}

/** Everything needed to log one (day, date): the session and its sets; last time comes from useLastTimes. */
export function useWorkoutDay(dayType: number, date: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const key = workoutDayKey(userId, dayType, date);

  const session = useQuery({ ...workoutDayQueryOptions(userId, dayType, date), enabled: !!user });

  const logSet = useMutation({
    mutationFn: (input: SetFields) => gymApi.logSet({ ...input, date, day_type: dayType }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ session: unknown; sets: WorkoutSet[] }>(key);
      const sets = previous?.sets ?? [];
      const sided = "reps_left" in input;

      // The server upserts on (session_id, exercise_name, set_number), so a repeat REPLACES: don't append.
      const optimistic = {
        id: `optimistic-${input.exercise_name}-${input.set_number}`,
        user_id: userId,
        session_id: "",
        exercise_name: input.exercise_name,
        set_number: input.set_number,
        // Mirrors the server, which forces 0 at write time for bodyweight sets.
        weight_kg: input.is_bodyweight ? 0 : input.weight_kg,
        // Mirrors the server: a single-sided set counts its lower side.
        reps: sided ? Math.min(input.reps_left, input.reps_right) : input.reps,
        reps_left: sided ? input.reps_left : null,
        reps_right: sided ? input.reps_right : null,
        is_bodyweight: input.is_bodyweight,
      } as WorkoutSet;

      qc.setQueryData(key, {
        session: previous?.session ?? null,
        sets: [
          ...sets.filter(
            (s) => !(s.exercise_name === input.exercise_name && s.set_number === input.set_number),
          ),
          optimistic,
        ].sort(
          (a, b) => a.exercise_name.localeCompare(b.exercise_name) || a.set_number - b.set_number,
        ),
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    // ['workoutDay'] is a prefix of `key`, so this covers this hook's query and every other reader.
    onSettled: () => invalidateSessionReaders(qc),
  });

  const deleteSet = useMutation({
    mutationFn: gymApi.deleteSet,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ session: unknown; sets: WorkoutSet[] }>(key);
      qc.setQueryData(key, {
        session: previous?.session ?? null,
        sets: (previous?.sets ?? []).filter((s) => s.id !== id),
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => invalidateSessionReaders(qc),
  });

  return {
    session: session.data?.session ?? null,
    sets: session.data?.sets ?? [],
    // isPending, not isLoading (CLAUDE.md): until sets are in, a guessed set number 1 overwrites set 1.
    isPending: session.isPending,
    // Failed with nothing to show is no better: `sets` is then [] as well.
    failed: session.isError && session.data === undefined,
    logSet,
    deleteSet,
  };
}
