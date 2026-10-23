import { useState } from "react";
import type { RecordEvent } from "@dashboard/shared";
import { List } from "@/components/ui/List";
import { Button } from "@/components/ui/Button";
import { orderRecords, recordLine } from "./recordLine";

const SHOWN = 5;

/**
 * A block of records: one line each, biggest jump first,
 * 5 shown and the rest behind "N more". The parent changes `key` to close it.
 */
export function RecordList({ title, events, empty }: { title: string; events: RecordEvent[]; empty: string }) {
  const [all, setAll] = useState(false);
  const ordered = orderRecords(events);
  const shown = all ? ordered : ordered.slice(0, SHOWN);

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="lbl">{title}</h2>
        {events.length > 0 && <span className="tnum text-xs text-muted">{events.length}</span>}
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <>
          <List role="list" aria-label={title} className="mt-2">
            {shown.map((e) => {
              const l = recordLine(e);
              return (
                // One record per exercise per date, so this key is unique.
                <div role="listitem" key={`${e.date}-${e.exercise_name}`} className="tnum flex items-baseline gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{e.exercise_name}</span>
                  <span className="font-semibold">{l.value}</span>
                  <span className="w-12 text-right text-muted">{l.change}</span>
                </div>
              );
            })}
          </List>
          {!all && ordered.length > SHOWN && (
            <Button variant="subtle" className="mt-1 px-0" onClick={() => setAll(true)}>
              {ordered.length - SHOWN} more
            </Button>
          )}
        </>
      )}
    </section>
  );
}
