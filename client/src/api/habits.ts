import { api } from "@/lib/api";
import type { Habit, HabitSummary } from "@dashboard/shared";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** The only module that names the /api/habits paths. */
export const habitsApi = {
  list: (today: string) => api<HabitSummary[]>(`/api/habits?today=${today}`),
  add: (name: string, emoji: string | null) => api<Habit>("/api/habits", json("POST", { name, emoji })),
  update: (id: string, patch: { name?: string; emoji?: string | null }) =>
    api<Habit>(`/api/habits/${id}`, json("PATCH", patch)),
  remove: (id: string) => api<void>(`/api/habits/${id}`, { method: "DELETE" }),
  reorder: (ids: string[]) => api<void>("/api/habits/reorder", json("POST", { ids })),
  // PUT marks, DELETE clears; repeating either is harmless.
  setDone: (id: string, date: string, done: boolean) =>
    api<void>(`/api/habits/${id}/days/${date}`, { method: done ? "PUT" : "DELETE" }),
};
