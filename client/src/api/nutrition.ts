import { api } from "@/lib/api";
import type {
  BarcodeResult, DayTotal, DiaryEntryInput, FoodLogEntry, FoodSearchResult, NutritionTarget, RecentFood, TargetInput, TdeeHint,
} from "@dashboard/shared";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** The only module that names the /api/nutrition and /api/food paths. */
export const nutritionApi = {
  targets: () => api<NutritionTarget[]>("/api/nutrition/targets"),
  addTarget: (input: TargetInput) => api<NutritionTarget>("/api/nutrition/targets", json("POST", input)),
  diary: (date: string) => api<FoodLogEntry[]>(`/api/nutrition/diary?date=${date}`),
  days: (from: string, to: string) => api<DayTotal[]>(`/api/nutrition/days?from=${from}&to=${to}`),
  addEntry: (input: DiaryEntryInput) => api<FoodLogEntry>("/api/nutrition/diary", json("POST", input)),
  rescaleEntry: (id: string, quantity: number) =>
    api<FoodLogEntry>(`/api/nutrition/diary/${id}`, json("PATCH", { quantity })),
  removeEntry: (id: string) => api<void>(`/api/nutrition/diary/${id}`, { method: "DELETE" }),
  copyDay: (from: string, to: string) => api<FoodLogEntry[]>("/api/nutrition/diary/copy", json("POST", { from, to })),
  recents: () => api<RecentFood[]>("/api/nutrition/recents"),
  tdee: (today: string) => api<TdeeHint>(`/api/nutrition/tdee?today=${today}`),
  barcode: (code: string) => api<BarcodeResult>(`/api/food/barcode/${code}`),
};

export const foodApi = {
  search: (q: string) => api<FoodSearchResult>(`/api/food/search?q=${encodeURIComponent(q)}`),
};
