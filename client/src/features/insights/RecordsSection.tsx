import { useState } from "react";
import type { RecordEvent } from "@dashboard/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useRecords } from "@/hooks/useInsights";
import { dayMonth } from "./format";

const PAGE = 20;

function beat(e: RecordEvent): string {
  const parts: string[] = [];
  if (e.heaviest) parts.push(`heaviest ${e.heaviest.weightKg} kg (was ${e.heaviest.previousKg})`);
  if (e.e1rm) parts.push(`est. 1RM ${e.e1rm.valueKg} kg (was ${e.e1rm.previousKg})`);
  if (e.reps) parts.push(`${e.reps.reps} reps (was ${e.reps.previous})`);
  return parts.join(" · ");
}

export function RecordsSection({ today }: { today: string }) {
  const records = useRecords();
  const [shown, setShown] = useState(PAGE);

  return (
    <Card>
      <div className="lbl">Records</div>
      {records.data && records.isError && (
        // A failed refresh keeps the last good list on screen (the Food page's pattern).
        <p className="mt-2 text-xs text-muted">Couldn't refresh — showing saved data.</p>
      )}
      {records.data ? (
        records.data.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No records yet. They appear when a lift beats its best.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {records.data.slice(0, shown).map((e) => (
                // One record per exercise per date, so this key is unique.
                <li key={`${e.date}-${e.exercise_name}`} className="text-sm">
                  <span className="tnum text-xs text-muted">{dayMonth(e.date, today)}</span>{" "}
                  <span className="font-semibold">{e.exercise_name}</span>
                  <div className="tnum text-xs text-muted">{beat(e)}</div>
                </li>
              ))}
            </ul>
            {shown < records.data.length && (
              <Button variant="ghost" className="mt-3 w-full" onClick={() => setShown((s) => s + PAGE)}>
                Show more
              </Button>
            )}
          </>
        )
      ) : records.isError ? (
        <div className="mt-3">
          <p className="text-sm text-negative">Could not load records</p>
          <Button variant="ghost" className="mt-2" onClick={() => void records.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <Spinner label="Loading records" />
      )}
    </Card>
  );
}
