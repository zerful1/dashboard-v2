import { api } from "@/lib/api";
import type { DataSummary, ExportFile } from "@dashboard/shared";

/** The only module that names the /api/export path. */
export const exportApi = {
  download: () => api<ExportFile>("/api/export"),
  summary: () => api<DataSummary>("/api/export/summary"),
};
