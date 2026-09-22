import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkoutSet } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi, type SetInput } from "@/api/gym";
import { invalidateSessionReaders } from "./invalidate";

export const workoutDayKey = (userId: string, dayType: number, date: string) =>
  ["workoutDay", userId, dayType, date] as const;

export const lastSessionKey = (userId: string, dayType: number, date: string) =>
  ["lastSession", userId, dayType, date] as const;

/** Everything needed to log one (day, date): the session, its sets, and last time's. */
export function useWorkoutDay(dayType: number, date: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const key = workoutDayKey(userId, dayType, date);

  const session = useQuery({
    queryKey: key,
    queryFn: async () => {
      const s = await gymApi.getSession(date, dayType);
      // No session yet is the normal state for a day you have not started —
      // not an error, and not a reason to show a spinner forever.
      return s ? { session: s, sets: await gymApi.listSets(s.id) } : { session: null, sets: [] };
    },
    enabled: !!user,
  });

  const lastSession = useQuery({
    queryKey: lastSessionKey(userId, dayType, date),
    queryFn: () => gymApi.lastSession(dayType, date),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const logSet = useMutation({
    mutationFn: (input: Omit<SetInput, "date" | "day_type">) =>
      gymApi.logSet({ ...input, date, day_type: dayType }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ session: unknown; sets: WorkoutSet[] }>(key);
      const sets = previous?.sets ?? [];

      // The server upserts on (session_id, exercise_name, set_number), so a
      // repeat of the same set number REPLACES. Appending here would briefly
      // render two rows that then collapse to one — and the row that vanished
      // would read as a bug rather than a correction.
      const optimistic = {
        id: `optimistic-${input.exercise_name}-${input.set_number}`,
        user_id: userId,
        session_id: "",
        exercise_name: input.exercise_name,
        set_number: input.set_number,
        // Mirrors the server, which forces 0 at write time for bodyweight sets.
        weight_kg: input.is_bodyweight ? 0 : input.weight_kg,
        reps: input.reps,
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
    // ["workoutDay"] is a prefix of `key`, so this hook's own query is covered
    // along with every other reader of sessions and sets.
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
    lastSets: lastSession.data ?? {},
    isLoading: session.isLoading,
    logSet,
    deleteSet,
  };
}
