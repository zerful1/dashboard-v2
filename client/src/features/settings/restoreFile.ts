import type { RestoreCounts, RestoredTable } from "@dashboard/shared";

export interface PackedBody {
  body: BodyInit;
  gzipped: boolean;
}

/** The file's text when it is a dashboard download, otherwise null: the sheet then sends nothing. */
export async function readDownload(file: File): Promise<string | null> {
  const text = await file.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return (parsed as { format?: unknown } | null)?.format === "dashboard-export" ? text : null;
  } catch {
    return null;
  }
}

/**
 * Gzipped, so a long-kept download stays far under Vercel's 4.5 MB request cap
 * (0.5 MB packs to about 60 KB). Plain where the browser has no
 * CompressionStream; the server takes either.
 */
export async function packBody(text: string): Promise<PackedBody> {
  if (typeof CompressionStream === "undefined") return { body: text, gzipped: false };
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  return { body: await new Response(stream).blob(), gzipped: true };
}

const counted = (one: string, many: string) => (n: number) => `${n} ${n === 1 ? one : many}`;

/** The sheet's order: weight, then gym, food, goals and habits, each parent before its children. */
const LABELS: [RestoredTable, (n: number) => string][] = [
  ["body_weight", (n) => `Weigh-ins ${n}`],
  ["workout_sessions", (n) => `Gym sessions ${n}`],
  ["workout_sets", counted("set", "sets")],
  ["cardio_entries", counted("cardio entry", "cardio entries")],
  ["food_items", (n) => `Foods ${n}`],
  ["food_log_entries", counted("food entry", "food entries")],
  ["nutrition_targets", (n) => `Targets ${n}`],
  ["goals", (n) => `Goals ${n}`],
  ["habits", (n) => `Habits ${n}`],
  ["habit_completions", counted("tick", "ticks")],
];

/** "Weigh-ins 2", "18 sets", …: what a restore adds, zeros left out. */
export function missingParts(c: RestoreCounts): string[] {
  return LABELS.filter(([t]) => c[t] > 0).map(([t, label]) => label(c[t]));
}

export function total(c: RestoreCounts): number {
  return Object.values(c).reduce((sum, n) => sum + n, 0);
}
