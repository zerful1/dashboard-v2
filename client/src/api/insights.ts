import { api } from "@/lib/api";
import type { RecordEvent, WeeklyReview } from "@dashboard/shared";

/** The only module that names the /api/insights paths. */
export const insightsApi = {
  review: (week: string) => api<WeeklyReview>(`/api/insights/review?week=${week}`),
  records: () => api<RecordEvent[]>("/api/insights/records"),
};
