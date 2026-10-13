import { trendTone, type BodyWeightEntry, type PeriodKind, type PeriodRow } from "@dashboard/shared";
import { List } from "@/components/ui/List";
import { listDate, monthRangeLabel, rangeLabel } from "@/lib/dates";
import { signed } from "@/features/insights/format";

interface Props {
  rows: PeriodRow[];
  kind: PeriodKind;
  /** Every weigh-in, newest first as the API sends them. */
  entries: BodyWeightEntry[];
  goalKg: number | null;
  today: string;
  /** The open row's start, or null. */
  open: string | null;
  onToggle: (start: string) => void;
  onSelect: (entry: BodyWeightEntry) => void;
}

/** The empty "—": decoration, so dim (CLAUDE.md). */
const Dash = () => <span className="text-dim">—</span>;

function label(row: PeriodRow, kind: PeriodKind, today: string): string {
  if (row.kind === "period" && row.current) return kind === "week" ? "This week" : "This month";
  return kind === "week" ? rangeLabel(row.start, row.end, today) : monthRangeLabel(row.start, row.end, today);
}

function spokenChange(row: Extract<PeriodRow, { kind: "period" }>): string {
  if (row.current) return "so far";
  if (row.change === null) return "no change to compare";
  if (row.change === 0) return "no change";
  return `${row.change < 0 ? "down" : "up"} ${Math.abs(row.change).toFixed(1)}`;
}

/**
 * The history by week or by month (redesign part 5, §4): each period's
 * average and its change from the one before, green only toward the goal. A
 * row opens onto its weigh-ins; each of those opens the weigh-in sheet.
 */
export function PeriodList({ rows, kind, entries, goalKg, today, open, onToggle, onSelect }: Props) {
  return (
    <div>
      <div className="lbl mb-2">{kind === "week" ? "Weeks" : "Months"}</div>
      <List>
        {rows.map((row) => {
          const name = label(row, kind, today);
          if (row.kind === "empty") {
            return (
              <div key={row.start} className="py-3 text-sm text-muted">
                {name} · no weigh-ins
              </div>
            );
          }
          const isOpen = open === row.start;
          const tone = row.change === null || row.average === null ? null : trendTone(row.average - row.change, row.average, goalKg);
          const inside = entries.filter((e) => e.date >= row.start && e.date <= row.end);
          return (
            <div key={row.start}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={`${name}: average ${row.average === null ? "none yet" : `${row.average.toFixed(1)} kg`}, ${spokenChange(row)}, ${row.weighIns} weigh-ins`}
                onClick={() => onToggle(row.start)}
                className="flex w-full items-center gap-2 py-3 text-left text-sm hover:bg-accent/5"
              >
                <span className={`w-28 shrink-0 ${row.current ? "text-text" : "text-muted"}`}>{name}</span>
                <span aria-hidden className="flex flex-1 items-center gap-1">
                  {row.days
                    ? row.days.map((d, i) =>
                        d === "future" ? (
                          <span key={i} className="h-1.5 w-1.5" />
                        ) : (
                          <span
                            key={i}
                            data-part="mark"
                            className={d === "weighed" ? "h-1.5 w-1.5 rounded-full bg-accent" : "h-1.5 w-1.5 rounded-full border border-dim"}
                          />
                        ),
                      )
                    : <span className="text-xs text-muted">{row.weighIns} {row.weighIns === 1 ? "weigh-in" : "weigh-ins"}</span>}
                </span>
                <span className="tnum w-10 text-right font-semibold">{row.average === null ? <Dash /> : row.average.toFixed(1)}</span>
                <span
                  data-tone={tone ?? undefined}
                  className={`tnum w-16 text-right ${tone === "good" ? "text-good" : "text-text"}`}
                >
                  {row.current ? (
                    <span className="text-muted">so far</span>
                  ) : row.change === null ? (
                    <Dash />
                  ) : (
                    <>
                      {row.change !== 0 && <span aria-hidden className="mr-1">{row.change < 0 ? "▼" : "▲"}</span>}
                      {signed(row.change, 1)}
                    </>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="pb-2">
                  {inside.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelect(e)}
                      className="flex w-full items-center justify-between py-2 pl-3 text-left text-sm hover:bg-accent/5"
                    >
                      <span className="text-muted">{listDate(e.date, today)}</span>
                      <span className="tnum">{e.weight_kg.toFixed(1)} kg</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </List>
    </div>
  );
}
