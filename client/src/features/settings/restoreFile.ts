import { RESTORE_MAX_BYTES, type RestoreCounts, type RestoredTable } from "@dashboard/shared";

export interface PackedBody {
  body: BodyInit;
  gzipped: boolean;
  /** What goes over the wire, packed. */
  bytes: number;
}

export const TOO_LARGE = "This file is too large to restore";

/**
 * Vercel's cap on a request body. One over it is refused before the server
 * sees it, as an error page the app can only call "Something went wrong".
 */
export const REQUEST_CAP_BYTES = 4_500_000;

/**
 * The file's text when it is a dashboard download, otherwise why the sheet
 * sends nothing. The size comes first, so a video picked by mistake is never
 * read into memory whole.
 */
export async function readDownload(file: File): Promise<{ text: string } | { refused: string }> {
  if (file.size > RESTORE_MAX_BYTES) return { refused: TOO_LARGE };
  const text = await file.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if ((parsed as { format?: unknown } | null)?.format === "dashboard-export") return { text };
  } catch {
    // Not JSON: not a download either.
  }
  return { refused: "This isn't a dashboard download" };
}

/**
 * Gzipped, so a long-kept download stays far under Vercel's 4.5 MB request cap
 * (0.5 MB packs to about 60 KB). Plain where the browser has no
 * CompressionStream; the server takes either.
 */
export async function packBody(text: string): Promise<PackedBody> {
  if (typeof CompressionStream === "undefined") return { body: text, gzipped: false, bytes: new Blob([text]).size };
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob();
  return { body: blob, gzipped: true, bytes: blob.size };
}

/**
 * Why a packed file would be refused on its way to the server, or null when it
 * can go. Sent plain (Safari before 16.4), a download of a few MB is over the
 * cap that gzip would have put it far under.
 */
export function cantSend({ bytes, gzipped }: PackedBody): string | null {
  if (bytes <= REQUEST_CAP_BYTES) return null;
  return gzipped ? TOO_LARGE : "This browser can't send a file this large. Try an up-to-date browser.";
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
