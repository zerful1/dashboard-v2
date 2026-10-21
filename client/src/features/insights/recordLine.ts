import type { RecordEvent } from "@dashboard/shared";

export interface RecordLine {
  /** "210 kg", "est. 70 kg", "12 reps". */
  value: string;
  /** "+10", "+2.5": rounded to one decimal, no trailing ".0". */
  change: string;
  /** How much the old best was beaten by, as a fraction; Infinity from 0. */
  percent: number;
}

function line(value: string, now: number, before: number): RecordLine {
  const diff = Math.round((now - before) * 10) / 10;
  return { value, change: `+${diff}`, percent: before > 0 ? (now - before) / before : Infinity };
}

/**
 * One record as one line: the heaviest weight when the
 * record was one, otherwise the estimated 1RM, otherwise the reps.
 */
export function recordLine(e: RecordEvent): RecordLine {
  if (e.heaviest) return line(`${e.heaviest.weightKg} kg`, e.heaviest.weightKg, e.heaviest.previousKg);
  if (e.e1rm) return line(`est. ${e.e1rm.valueKg} kg`, e.e1rm.valueKg, e.e1rm.previousKg);
  if (e.reps) return line(`${e.reps.reps} reps`, e.reps.reps, e.reps.previous);
  return { value: "", change: "", percent: 0 };
}

/** The biggest jump first, by percentage; on a tie, the newest. */
export function orderRecords(events: RecordEvent[]): RecordEvent[] {
  return [...events].sort((a, b) => recordLine(b).percent - recordLine(a).percent || b.date.localeCompare(a.date));
}

/** The records dated from `from` to `to`, both included. */
export function recordsIn(events: RecordEvent[], from: string, to: string): RecordEvent[] {
  return events.filter((e) => e.date >= from && e.date <= to);
}
