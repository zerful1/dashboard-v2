import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { HabitSummary } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** A habit in edit mode: rename it, move it, or delete it. */
export function EditHabitRow({ habit, first, last, onSave, onMove, onDelete }: {
  habit: HabitSummary;
  first: boolean;
  last: boolean;
  onSave: (name: string, emoji: string | null) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji ?? "");
  const changed = name.trim() !== habit.name || (emoji.trim() || null) !== habit.emoji;
  const icon = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted disabled:opacity-30";
  return (
    <li className="flex items-center gap-2">
      <Input aria-label={`Emoji for ${habit.name}`} value={emoji} maxLength={16}
        onChange={(e) => setEmoji(e.target.value)} className="w-14 text-center" />
      <Input aria-label={`Name for ${habit.name}`} value={name} maxLength={40}
        onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
      {changed && name.trim() && (
        <Button variant="ghost" onClick={() => onSave(name.trim(), emoji.trim() || null)}>Save</Button>
      )}
      <button type="button" aria-label={`Move ${habit.name} up`} disabled={first} onClick={() => onMove(-1)} className={icon}>
        <ChevronUp size={18} aria-hidden />
      </button>
      <button type="button" aria-label={`Move ${habit.name} down`} disabled={last} onClick={() => onMove(1)} className={icon}>
        <ChevronDown size={18} aria-hidden />
      </button>
      <button type="button" aria-label={`Delete ${habit.name}`} onClick={onDelete} className={icon}>
        <Trash2 size={18} aria-hidden />
      </button>
    </li>
  );
}
