import { useEffect, useState } from "react";
import { shiftISO } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { DateSelector } from "@/components/ui/DateSelector";
import { useDiary } from "@/hooks/useDiary";
import { prettyDate } from "@/lib/dates";

export function CopyDaySheet({
  open,
  onClose,
  to,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  to: string;
  copy: ReturnType<typeof useDiary>["copyDay"];
}) {
  const [from, setFrom] = useState(() => shiftISO(to, -1));
  useEffect(() => {
    if (open) setFrom(shiftISO(to, -1));
  }, [open, to]);

  // Read only for the count, and only while the sheet is open.
  const source = useDiary(from, { enabled: open });
  const n = source.entries.length;
  const same = from === to;
  const empty = !source.isPending && n === 0;
  // Disabled while the copy is pending: there is no optimistic write to hide a
  // double tap behind, so the second tap would copy the day again.
  const blocked = same || source.isPending || n === 0 || copy.isPending;

  return (
    <Sheet open={open} onClose={onClose} title={`Copy into ${prettyDate(to)}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Copy from</span>
          <DateSelector value={from} onChange={setFrom} />
        </div>
        {same && <p className="text-sm text-dim">Pick a different day.</p>}
        {!same && empty && <p className="text-sm text-dim">Nothing logged on {prettyDate(from)}.</p>}
        <Button
          className="w-full"
          disabled={blocked}
          loading={copy.isPending}
          onClick={() => copy.mutate({ from, to }, { onSuccess: onClose })}
        >
          {n > 0 && !same ? `Copy ${n} ${n === 1 ? "food" : "foods"} from ${prettyDate(from)}` : "Copy"}
        </Button>
      </div>
    </Sheet>
  );
}
