import { cn } from "@/lib/cn";
import type { FoodLogEntry } from "@dashboard/shared";

/**
 * logged_at is an INSTANT (timestamptz), so parsing it into a Date is right:
 * the dates-as-strings rule is about calendar `date` columns.
 */
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function amountOf(e: Pick<FoodLogEntry, "quantity" | "unit">): string {
  if (e.unit === "g") return `${fmt(e.quantity)} g`;
  return e.quantity === 1 ? "1 serving" : `${fmt(e.quantity)} servings`;
}

export function DiaryList({ entries, onSelect }: { entries: FoodLogEntry[]; onSelect: (e: FoodLogEntry) => void }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-card border border-raised bg-surface px-4 py-6 text-center text-sm text-dim">
        Nothing logged
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-raised bg-surface">
      {entries.map((e, i) => (
        <button
          key={e.id}
          // Not yet saved: it has no server id to edit or delete.
          disabled={e.id.startsWith("optimistic-")}
          onClick={() => onSelect(e)}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60",
            i > 0 && "border-t border-raised",
          )}
        >
          <span className="tnum w-11 shrink-0 text-xs text-dim">{timeOf(e.logged_at)}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span>{e.name}</span> <span className="text-muted">· {amountOf(e)}</span>
          </span>
          <span className="tnum text-sm font-bold">{Math.round(e.calories)}</span>
        </button>
      ))}
    </div>
  );
}
