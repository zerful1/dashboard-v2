import { STANDARD_PLATES_KG } from "@dashboard/shared";
import { parseDecimal } from "@/lib/number";

// Remembered on this device only (not the account): the starting weight, which
// plates the gym has, and the last mode. Totals are deliberately not kept.
const KEY = "plates.prefs";

export type PlateMode = "me" | "buddy";
export interface PlatePrefs {
  mode: PlateMode;
  start: string;
  plates: number[];
}

const DEFAULTS = (): PlatePrefs => ({ mode: "me", start: "", plates: [...STANDARD_PLATES_KG] });

/** Whatever is stored, cleaned: anything unreadable falls back to the default for that field. */
export function readPrefs(): PlatePrefs {
  const prefs = DEFAULTS();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return prefs;
    const r = raw as Record<string, unknown>;
    if (r.mode === "me" || r.mode === "buddy") prefs.mode = r.mode;
    if (typeof r.start === "string" && parseDecimal(r.start) !== null) prefs.start = r.start;
    if (Array.isArray(r.plates)) {
      const kept = STANDARD_PLATES_KG.filter((p) => (r.plates as unknown[]).includes(p));
      if (kept.length > 0) prefs.plates = kept;
    }
  } catch {
    // Blocked or unreadable storage: the defaults stand.
  }
  return prefs;
}

export function writePrefs(prefs: PlatePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Blocked or full: the calculator still works, it just forgets.
  }
}
