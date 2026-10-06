import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { deriveHome, nextUp, workoutProgress, type HomeTop, type WorkoutProgress } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useSplit } from "@/hooks/useSplit";
import { useWeights } from "@/hooks/useWeights";
import { useDiary } from "@/hooks/useDiary";
import { useTargets } from "@/hooks/useTargets";
import { goalsQueryOptions } from "@/hooks/useGoals";
import { exercisesQueryOptions } from "@/hooks/useExercises";
import { workoutDayQueryOptions } from "@/hooks/useWorkoutDay";
import { deriveWeightSummary } from "@/features/weight/deriveWeight";
import { deriveDay } from "@/features/nutrition/deriveDay";
import { gymApi } from "@/api/gym";

/**
 * One page-1 fetch of sessions answers the week line. A week is at most 7
 * sessions, so 20 is comfortably enough. The key deliberately does NOT match
 * useWorkoutHistory's: that one is an infinite query of pages, a different shape.
 */
const RECENT_LIMIT = 20;

/**
 * Everything Home shows for `today`, and what claims its top slot (redesign
 * part 2). One isPending covers EVERY source it reads: the top slot is a
 * conclusion, and drawn from a half-loaded day it flashes the wrong hero
 * (CLAUDE.md, isPending not isLoading). The split is in the gate because
 * useSplit returns DEFAULT_SPLIT until it loads, so an unloaded split names a
 * real but wrong day.
 */
export function useHomeDay(today: string) {
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const { split, isPending: splitPending } = useSplit();
  const weights = useWeights();
  // Home renders its own failure line for these, so no toast as well.
  const diary = useDiary(today, { errorToast: false });
  const targets = useTargets({ errorToast: false });
  const goals = useQuery(goalsQueryOptions(user?.id));
  const sessions = useQuery({
    queryKey: ["homeSessions", userId],
    queryFn: () => gymApi.getSessions({ limit: RECENT_LIMIT }),
    enabled: !!user,
  });

  const home = useMemo(() => deriveHome(split, sessions.data ?? [], today), [split, sessions.data, today]);
  const dayType = home.today.dayType;
  // Only once the real split says today trains: a rest day reads neither query.
  const training = !!user && !splitPending && dayType !== null;
  const exercises = useQuery({ ...exercisesQueryOptions(userId, dayType ?? 0), enabled: training });
  const sets = useQuery({ ...workoutDayQueryOptions(userId, dayType ?? 0, today), enabled: training });

  const isPending =
    splitPending || sessions.isPending || weights.isPending || diary.isPending || targets.isPending ||
    goals.isPending || (training && (exercises.isPending || sets.isPending));

  const workoutError = training && (exercises.isError || sets.isError);
  const progress: WorkoutProgress | null =
    training && exercises.data && sets.data
      ? workoutProgress(exercises.data.map((e) => e.exercise_name), sets.data.sets.map((s) => s.exercise_name))
      : null;

  const top: HomeTop = nextUp({
    weighedInToday: weights.isError ? null : weights.entries.some((e) => e.date === today),
    isRest: home.today.isRest,
    workout: workoutError || !progress ? null : { finished: progress.finished },
  });

  const weight = useMemo(() => deriveWeightSummary(weights.entries, today), [weights.entries, today]);
  const day = useMemo(() => deriveDay(diary.entries, targets.targets, today), [diary.entries, targets.targets, today]);

  return {
    isPending,
    top,
    workout: { label: home.today.label, isRest: home.today.isRest, progress, isError: workoutError },
    food: { day, isError: diary.isError || targets.isError, addEntry: diary.addEntry },
    weight: {
      summary: weight,
      goalKg: goals.data?.find((g) => g.kind === "weight")?.target_kg ?? null,
      isError: weights.isError,
      saveWeight: weights.saveWeight,
    },
    week: home.week,
  };
}
