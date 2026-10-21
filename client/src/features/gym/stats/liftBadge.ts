import type { LiftProgress } from "@dashboard/shared";

export type BadgeTone = "good" | "muted" | "caution";

/** Tailwind classes per tone: each signal colour's one job (CLAUDE.md). */
export const TONE: Record<BadgeTone, string> = { good: "text-good", muted: "text-muted", caution: "text-caution" };

/** A lift's badge. Not lately has none: its row shows its last date. */
export function liftBadge(p: LiftProgress): { text: string; tone: BadgeTone } | null {
  switch (p.status) {
    case "new":
      return { text: "New", tone: "good" };
    case "moving": {
      const pct = Math.round((p.change ?? 0) * 100);
      return { text: pct < 1 ? "▲ <1%" : `▲ ${pct}%`, tone: "good" };
    }
    case "back":
      return { text: `▼ ${Math.abs(Math.round((p.change ?? 0) * 100))}%`, tone: "caution" };
    case "stalled":
      return {
        text: p.weeksSinceBest === null ? "No best yet" : p.weeksSinceBest < 1 ? "No new best" : `No best in ${p.weeksSinceBest} wk`,
        tone: "muted",
      };
    case "old":
      return null;
  }
}
