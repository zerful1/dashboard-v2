import { setCell, cardioLine } from "@dashboard/shared";
import { listDate } from "@/lib/dates";
import { useToday } from "@/hooks/useToday";
import type { WorkoutSession } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useSessionDetail } from "@/hooks/useSessionDetail";

export function SessionDetailSheet({
  session,
  onClose,
  onEditInLog,
}: {
  session: WorkoutSession | null;
  onClose: () => void;
  onEditInLog: (s: WorkoutSession) => void;
}) {
  const today = useToday();
  const { data, isLoading, isError } = useSessionDetail(session?.id ?? null);
  const sets = data?.sets ?? [];
  const cardio = data?.cardio ?? [];

  const names = [...new Set(sets.map((s) => s.exercise_name))];
  // Derived, not hardcoded. v1 rendered exactly four set columns; real sessions
  // reach 22 sets, so a fixed count silently truncates history — and the rows
  // it drops are the ones from the hardest sessions.
  const maxSet = sets.reduce((m, s) => Math.max(m, s.set_number), 0);
  const columns = Array.from({ length: maxSet }, (_, i) => i + 1);

  return (
    <Sheet
      open={!!session}
      onClose={onClose}
      title={session ? `${listDate(session.date, today)} · ${session.day_name}` : ""}
    >
      <div className="max-h-[60vh] overflow-auto">
        {isLoading && <p className="py-4 text-center text-xs text-muted">Loading…</p>}
        {isError && (
          <p className="py-4 text-center text-xs text-negative">Couldn&apos;t load this session</p>
        )}

        {data && names.length === 0 && cardio.length === 0 && (
          <p className="py-4 text-center text-xs text-muted">No data for this session</p>
        )}

        {names.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-raised">
                <th className="whitespace-nowrap py-1.5 pr-3 text-left">
                  <span className="lbl">Exercise</span>
                </th>
                {columns.map((n) => (
                  <th key={n} className="whitespace-nowrap px-2 py-1.5 text-center">
                    <span className="lbl">{n}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name} className="border-b border-raised/50">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-text">{name}</td>
                  {columns.map((n) => {
                    const s = sets.find((x) => x.exercise_name === name && x.set_number === n);
                    return (
                      // nowrap: "100 × 8" must not break in a narrow column; a long session scrolls sideways instead.
                      <td key={n} className="tnum whitespace-nowrap px-2 py-1.5 text-center text-muted">
                        {s ? setCell(s) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {cardio.map((e) => (
          <p
            key={e.id}
            className="border-t border-raised/40 py-1.5 text-[11px] italic text-muted"
          >
            {cardioLine(e)}
          </p>
        ))}
      </div>

      {session && (
        <Button
          className="mt-4 w-full"
          onClick={() => {
            // Capture before closing: onClose clears the parent's state, so
            // reading `session` after it would be reading null.
            const s = session;
            onClose();
            onEditInLog(s);
          }}
        >
          Edit in Log
        </Button>
      )}
    </Sheet>
  );
}
