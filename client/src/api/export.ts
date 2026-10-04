import { api } from "@/lib/api";
import type { ExportFile } from "@dashboard/shared";

/** The only module that names the /api/export path. */
export const exportApi = {
  download: () => api<ExportFile>("/api/export"),
};
