import { api } from "@/lib/api";
import type { RestoreCounts } from "@dashboard/shared";
import type { PackedBody } from "@/features/settings/restoreFile";

const post = (path: string, { body, gzipped }: PackedBody) =>
  api<{ added: RestoreCounts }>(path, {
    method: "POST",
    body,
    headers: gzipped ? { "Content-Encoding": "gzip" } : undefined,
  });

/** The only module that names the /api/restore paths. */
export const restoreApi = {
  /** What a restore would add, with nothing written. */
  preview: (packed: PackedBody) => post("/api/restore/preview", packed),
  restore: (packed: PackedBody) => post("/api/restore", packed),
};
