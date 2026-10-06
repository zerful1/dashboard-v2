import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { setCell, type LiftProgress, type LiftStatus } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";
import { List } from "@/components/ui/List";
import { Spinner } from "@/components/ui/Spinner";
import { useLiftProgress } from "@/hooks/useLiftStats";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { liftBadge, TONE } from "./liftBadge";

const GROUPS: { label: string; statuses: LiftStatus[] }[] = [
  { label: "Moving", statuses: ["moving", "new"] },
  { label: "Stalled", statuses: ["stalled"] },
  { label: "Going back", statuses: ["back"] },
];

function LiftRow({ lift, today, onOpen }: { lift: LiftProgress; today: string; onOpen: (name: string) => void }) {
  const badge = liftBadge(lift);
  return (
    <button type="button" onClick={() => onOpen(lift.name)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-accent/5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{lift.name}</span>
        <span className="tnum block text-xs text-muted">
          {lift.status === "old" || !lift.best
            ? `Last ${shortDate(lift.lastDate, today)}`
            : `Best ${setCell(lift.best)} · ${shortDate(lift.best.date, today)}`}
        </span>
      </span>
      {badge && <span className={cn("tnum shrink-0 text-xs", TONE[badge.tone])}>{badge.text}</span>}
    </button>
  );
}

/** Every lift by trend (redesign part 3b, §3), with search; lifts not trained lately fold away. */
export function LiftsOverview({ today, search, onSearch, onOpen }: {
  today: string;
  search: string;
  onSearch: (s: string) => void;
  onOpen: (name: string) => void;
}) {
  const { lifts, isPending } = useLiftProgress(today);
  const [unfolded, setUnfolded] = useState(false);

  // A conclusion: nothing until it has loaded (CLAUDE.md, isPending).
  if (isPending) return <Spinner label="Loading your lifts" />;
  if (!lifts) return <p className="py-6 text-center text-sm text-muted">Couldn't load your lifts.</p>;
  if (lifts.length === 0) return <p className="py-6 text-center text-sm text-muted">Log some sets and your lifts will show here.</p>;

  const q = search.trim().toLowerCase();
  const shown = q ? lifts.filter((l) => l.name.toLowerCase().includes(q)) : lifts;
  const old = shown.filter((l) => l.status === "old");
  const open = unfolded || q.length > 0;

  return (
    <div className="space-y-4">
      <Input aria-label="Search lifts" placeholder="Search lifts" value={search} onChange={(e) => onSearch(e.target.value)} />
      {GROUPS.map((g) => {
        const rows = shown.filter((l) => g.statuses.includes(l.status));
        if (rows.length === 0) return null;
        return (
          <section key={g.label} aria-label={g.label}>
            <div className="lbl pb-2">
              {g.label} · {rows.length}
            </div>
            <List>
              {rows.map((l) => (
                <LiftRow key={l.name} lift={l} today={today} onOpen={onOpen} />
              ))}
            </List>
          </section>
        );
      })}
      {old.length > 0 && (
        <section aria-label="Not lately">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setUnfolded((v) => !v)}
            className="flex w-full items-center justify-between py-2"
          >
            <span className="lbl">Not lately · {old.length}</span>
            <ChevronDown size={14} aria-hidden="true" className={cn("text-muted transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <List>
              {old.map((l) => (
                <LiftRow key={l.name} lift={l} today={today} onOpen={onOpen} />
              ))}
            </List>
          )}
        </section>
      )}
      {q && shown.length === 0 && <p className="text-sm text-muted">No lifts match “{search.trim()}”.</p>}
    </div>
  );
}
