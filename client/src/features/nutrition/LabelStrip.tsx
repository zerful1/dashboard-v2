import type { LabelSums, LabelTotals } from "@dashboard/shared";

export const LABEL_ROWS: { key: keyof LabelTotals; label: string; dp: number }[] = [
  { key: "fibre_g", label: "Fibre", dp: 0 },
  { key: "sugar_g", label: "Sugar", dp: 0 },
  { key: "sat_fat_g", label: "Sat fat", dp: 0 },
  { key: "salt_g", label: "Salt", dp: 1 },
];

/** Off to the side by design: muted, small, and no targets. */
export function LabelStrip({ labels }: { labels: LabelSums }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-1 text-xs text-muted">
      {LABEL_ROWS.map((r) => {
        const v = labels[r.key];
        return (
          <p key={r.key}>
            {r.label}{" "}
            <span className="tnum">{v.total === null ? "—" : `${v.total.toFixed(r.dp)} g`}</span>
            {v.partial && <span className="text-dim"> (partial)</span>}
          </p>
        );
      })}
    </div>
  );
}
