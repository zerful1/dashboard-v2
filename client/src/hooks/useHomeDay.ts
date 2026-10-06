import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { deriveHome, nextUp, todaysWorkout, workoutProgress, type HomeTop, type WorkoutProgress } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useSplit } from "@/hooks/useSplit";
import { useWeights } from "@/hooks/useWeights";
import { useDiary } from "@/hooks/useDiary";
import { useTargets } from "@/hooks/useTargets";
import { goalsQueryOptions } from "@/hooks/useGoals";
import { exercisesQueryOptions } from "@/hooks/useExercises";
import { workoutDayQueryOptions } from "@/hooks/useWorkoutDay";
import { cardioQueryOptions } from "@/hooks/useCardio";
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
  // Which workout today is (redesign part 3a, §5): a session already logged
  // today wins over the schedule. Until the sessions arrive this is the
  // scheduled day, so its queries start at once; the gate holds the slot.
  const workoutToday = useMemo(
    () =>
      todaysWorkout(
        home.today.dayType === null ? null : { dayType: home.today.dayType, label: home.today.label },
        sessions.data ?? [],
        today,
      ),
    [home.today.dayType, home.today.label, sessions.data, today],
  );
  const dayType = workoutToday?.dayType ?? null;
  // Only once the real split says what today is: a rest day with nothing
  // logged reads none of these.
  const training = !!user && !splitPending && dayType !== null;
  const exercises = useQuery({ ...exercisesQueryOptions(userId, dayType ?? 0), enabled: training });
  const sets = useQuery({ ...workoutDayQueryOptions(userId, dayType ?? 0, today), enabled: training });
  // Cardio decides a cardio-only day. It can exist only once today's session does.
  const sessionId = sets.data?.session?.id ?? null;
  const withCardio = training && sessionId !== null;
  const cardio = useQuery({ ...cardioQueryOptions(userId, sessionId), enabled: withCardio });

  const isPending =
    splitPending || sessions.isPending || weights.isPending || diary.isPending || targets.isPending ||
    goals.isPending || (training && (exercises.isPending || sets.isPending)) || (withCardio && cardio.isPending);

  // A source has failed only when it has nothing to show. A failed refetch keeps
  // the last good data and still sets isError (CLAUDE.md), and a phone refetches
  // on every focus: one flaky response must not move the slot or blank a section.
  const weightsFailed = weights.isError && !weights.hasData;
  const workoutError =
    training &&
    ((exercises.isError && !exercises.data) ||
      (sets.isError && !sets.data) ||
      (withCardio && cardio.isError && !cardio.data));
  const progress: WorkoutProgress | null =
    training && exercises.data && sets.data && (!withCardio || cardio.data)
      ? workoutProgress(
          exercises.data.map((e) => e.exercise_name),
          sets.data.sets.map((s) => s.exercise_name),
          cardio.data?.length ?? 0,
        )
      : null;

  const top: HomeTop = nextUp({
    weighedInToday: weightsFailed ? null : weights.entries.some((e) => e.date === today),
    isRest: workoutToday === null,
    workout: workoutError || !progress ? null : { finished: progress.finished },
  });

  const weight = useMemo(() => deriveWeightSummary(weights.entries, today), [weights.entries, today]);
  const day = useMemo(() => deriveDay(diary.entries, targets.targets, today), [diary.entries, targets.targets, today]);

  return {
    isPending,
    top,
    workout: { label: workoutToday?.label ?? "Rest day", isRest: workoutToday === null, progress, isError: workoutError },
    food: {
      day,
      isError: (diary.isError && !diary.hasData) || (targets.isError && !targets.hasData),
      addEntry: diary.addEntry,
    },
    weight: {
      summary: weight,
      goalKg: goals.data?.find((g) => g.kind === "weight")?.target_kg ?? null,
      isError: weightsFailed,
      saveWeight: weights.saveWeight,
    },
    week: home.week,
  };
}
