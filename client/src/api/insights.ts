import { api } from "@/lib/api";
import type { Goal, Projection, RecordEvent, WeeklyReview } from "@dashboard/shared";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** The only module that names the /api/insights and /api/goals paths. */
export const insightsApi = {
  review: (week: string) => api<WeeklyReview>(`/api/insights/review?week=${week}`),
  records: () => api<RecordEvent[]>("/api/insights/records"),
  goals: () => api<Goal[]>("/api/goals"),
  setWeightGoal: (target_kg: number) => api<Goal>("/api/goals/weight", json("PUT", { target_kg })),
  addLiftGoal: (exercise_name: string, target_kg: number) =>
    api<Goal>("/api/goals/lifts", json("POST", { exercise_name, target_kg })),
  removeGoal: (id: string) => api<void>(`/api/goals/${id}`, { method: "DELETE" }),
  projections: (today: string) => api<Projection[]>(`/api/insights/projections?today=${today}`),
};
