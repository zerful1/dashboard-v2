import { useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { addDay, removeDay, renameDay, setWeekSlot } from "@dashboard/shared";
import type { DayType, SplitConfig } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSplit } from "@/hooks/useSplit";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SplitEditorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { split, saveSplit } = useSplit();
  const [draft, setDraft] = useState<SplitConfig>(split);

  /**
   * Seed the working copy only on the closed→open edge.
   *
   * Seeding on every `split` change would let a background refetch overwrite
   * edits mid-typing — and the query is invalidated by the very save this sheet
   * performs, so the race is not hypothetical.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(split);
    wasOpen.current = open;
  }, [open, split]);

  const canSave = draft.days.length > 0 && draft.days.every((d) => d.label.trim().length > 0);

  return (
    <Sheet open={open} onClose={onClose} title="Edit split">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto">
        <div>
          <div className="lbl mb-2">Training days</div>
          <div className="space-y-2">
            {draft.days.map((d) => (
              <div key={d.day_type} className="flex items-center gap-2">
                <Input
                  aria-label={`Name for day ${d.day_type}`}
                  value={d.label}
                  onChange={(e) => setDraft((c) => renameDay(c, d.day_type, e.target.value))}
                  placeholder="Day name"
                />
                <button
                  onClick={() => setDraft((c) => removeDay(c, d.day_type))}
                  disabled={draft.days.length <= 1}
                  aria-label={`Remove ${d.label || "day"}`}
                  className="shrink-0 p-2 text-muted disabled:opacity-30"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDraft((c) => addDay(c))}
            className="mt-2 flex items-center gap-1.5 text-sm text-accent"
          >
            <Plus size={14} /> Add day
          </button>
        </div>

        <div>
          <div className="lbl mb-2">Weekly rotation</div>
          <div className="space-y-1.5">
            {WEEKDAYS.map((wd, i) => (
              <div key={wd} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm text-muted">{wd}</span>
                <select
                  aria-label={`${wd} training day`}
                  value={String(draft.week[i] ?? "rest")}
                  onChange={(e) => {
                    const v = e.target.value;
                    const slot: DayType = v === "rest" ? "rest" : Number(v);
                    setDraft((c) => setWeekSlot(c, i, slot));
                  }}
                  className="flex-1 rounded-lg border border-raised bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                >
                  <option value="rest">Rest</option>
                  {draft.days.map((d) => (
                    <option key={d.day_type} value={d.day_type}>
                      {d.label || `Day ${d.day_type}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {!canSave && <p role="alert" className="text-xs text-negative">Every day needs a name</p>}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!canSave}
            loading={saveSplit.isPending}
            onClick={() => {
              saveSplit.mutate({
                days: draft.days.map((d) => ({ ...d, label: d.label.trim() })),
                week: draft.week,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
