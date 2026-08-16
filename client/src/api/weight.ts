import { api } from "@/lib/api";
import type { BodyWeightEntry } from "@dashboard/shared";

export interface WeightInput {
  date: string; // YYYY-MM-DD, resolved by the client
  weight_kg: number;
  notes?: string | null;
}

/**
 * The only module that names the /api/weight paths.
 *
 * Keeping the URLs in one place is the same discipline as `api()` being the
 * only fetch call site: a path that appears in three components is a path that
 * changes in two of them.
 */
export const weightApi = {
  list: () => api<BodyWeightEntry[]>("/api/weight"),
  save: (input: WeightInput) =>
    api<BodyWeightEntry>("/api/weight", { method: "POST", body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/api/weight/${id}`, { method: "DELETE" }),
};
