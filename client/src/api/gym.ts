import { api } from "@/lib/api";
import type {
  Exercise,
  ExerciseNameRow,
  LiftProgress,
  LiftSetRow,
  SessionSummary,
  WorkoutSession,
  WorkoutSet,
  LastTime,
  CardioEntry,
  SplitConfig,
  CoachingResult,
} from "@dashboard/shared";

/** Plain reps, or both sides of a single-sided set: the server counts the lower. */
export type SetReps = { reps: number } | { reps_left: number; reps_right: number };

/** One set as the logging sheet describes it. */
export type SetFields = {
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  is_bodyweight: boolean;
} & SetReps;

export type SetInput = { date: string; day_type: number } & SetFields;

export interface CardioInput {
  exercise: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  speed: number | null;
  incline: number | null;
  calories_burned: number | null;
}

/** The only module that names a gym path. */
export const gymApi = {
  getSplit: () => api<SplitConfig>("/api/split"),
  saveSplit: (config: SplitConfig) =>
    api<SplitConfig>("/api/split", { method: "PUT", body: JSON.stringify(config) }),

  listExercises: (dayType: number) => api<Exercise[]>(`/api/exercises?day_type=${dayType}`),
  listExerciseNames: () => api<ExerciseNameRow[]>("/api/exercises/names"),
  addExercise: (dayType: number, name: string) =>
    api<Exercise>("/api/exercises", {
      method: "POST",
      body: JSON.stringify({ day_type: dayType, exercise_name: name }),
    }),
  deleteExercise: (id: string) => api<void>(`/api/exercises/${id}`, { method: "DELETE" }),
  reorderExercises: (dayType: number, orderedIds: string[]) =>
    api<Exercise[]>("/api/exercises/reorder", {
      method: "POST",
      body: JSON.stringify({ day_type: dayType, ordered_ids: orderedIds }),
    }),
  renameExercise: (oldName: string, dayType: number, newName: string) =>
    api<{ exercisesUpdated: number; setsUpdated: number; finalName: string; merged: boolean }>(
      "/api/exercises/rename",
      {
        method: "POST",
        body: JSON.stringify({ old_name: oldName, day_type: dayType, new_name: newName }),
      },
    ),

  getSession: (date: string, dayType: number) =>
    api<WorkoutSession | null>(`/api/workouts/session?date=${date}&day_type=${dayType}`),
  getSessions: (opts: { limit?: number; offset?: number; day_name?: string; since?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set("limit", String(opts.limit));
    if (opts.offset != null) p.set("offset", String(opts.offset));
    if (opts.day_name) p.set("day_name", opts.day_name);
    if (opts.since) p.set("since", opts.since);
    return api<SessionSummary[]>(`/api/workouts/sessions?${p}`);
  },
  listSets: (sessionId: string) => api<WorkoutSet[]>(`/api/workouts/sets?session_id=${sessionId}`),
  logSet: (input: SetInput) =>
    api<WorkoutSet>("/api/workouts/sets", { method: "POST", body: JSON.stringify(input) }),
  deleteSet: (id: string) => api<void>(`/api/workouts/sets/${id}`, { method: "DELETE" }),
  lastTimes: (names: string[], before: string) =>
    api<Record<string, LastTime>>(
      `/api/workouts/last-times?before=${before}&${names.map((n) => `name=${encodeURIComponent(n)}`).join("&")}`,
    ),
  coaching: (exerciseName: string) =>
    api<CoachingResult | null>(
      `/api/workouts/coaching?exercise_name=${encodeURIComponent(exerciseName)}`,
    ),

  stats: (exerciseName: string) =>
    api<LiftSetRow[]>(`/api/workouts/stats?exercise_name=${encodeURIComponent(exerciseName)}`),
  progress: (today: string) => api<LiftProgress[]>(`/api/workouts/progress?today=${today}`),
  sessionDetail: (sessionId: string) =>
    api<{ sets: WorkoutSet[]; cardio: CardioEntry[] }>(
      `/api/workouts/session-detail?session_id=${sessionId}`,
    ),
  historyExerciseNames: () => api<string[]>("/api/workouts/exercise-names"),
  dayNames: () => api<string[]>("/api/workouts/day-names"),

  listCardio: (sessionId: string) => api<CardioEntry[]>(`/api/cardio?session_id=${sessionId}`),
  addCardio: (date: string, dayType: number, fields: CardioInput) =>
    api<CardioEntry>("/api/cardio", {
      method: "POST",
      body: JSON.stringify({ date, day_type: dayType, ...fields }),
    }),
  updateCardio: (id: string, fields: CardioInput) =>
    api<CardioEntry>(`/api/cardio/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
  deleteCardio: (id: string) => api<void>(`/api/cardio/${id}`, { method: "DELETE" }),
};
