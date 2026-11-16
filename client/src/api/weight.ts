import { api } from "@/lib/api";
import type { BodyWeightEntry } from "@dashboard/shared";

export interface WeightInput {
  date: string; // YYYY-MM-DD, resolved by the client
  weight_kg: number;
  notes?: string | null;
}

/** The only module that names the /api/weight paths. */
export const weightApi = {
  list: () => api<BodyWeightEntry[]>("/api/weight"),
  save: (input: WeightInput) =>
    api<BodyWeightEntry>("/api/weight", { method: "POST", body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/api/weight/${id}`, { method: "DELETE" }),
};
