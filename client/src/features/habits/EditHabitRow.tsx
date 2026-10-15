import { useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { HabitSummary } from "@dashboard/shared";
import { Input } from "@/components/ui/Input";

/**
 * A habit in edit mode: rename it, move it, or delete it. The fields get the
 * row's full width and the controls sit on a line of their own, so the name
 * stays readable on a phone.
 */
export function EditHabitRow({ habit, first, last, locked, canMove, onSave, onMove, onDelete }: {
  habit: HabitSummary;
  first: boolean;
  last: boolean;
  /** Not saved yet: it has no server id to act on. */
  locked: boolean;
  /** False while a habit is being added: the new order would carry its temporary id. */
  canMove: boolean;
  onSave: (name: string, emoji: string | null) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji ?? "");

  // Saved on leaving a field, so tapping Done - which takes the focus first -
  // keeps an edit rather than dropping it. A blank name puts the old one back.
  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(habit.name);
      return;
    }
    const nextEmoji = emoji.trim() || null;
    if (trimmed !== habit.name || nextEmoji !== habit.emoji) onSave(trimmed, nextEmoji);
  }
  // Enter, or a phone keyboard's Done, leaves the field, which saves it.
  const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const icon = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted disabled:opacity-30";
  return (
    <div role="listitem" className="space-y-2 py-3">
      <div className="flex gap-2">
        <Input aria-label={`Emoji for ${habit.name}`} value={emoji} maxLength={16} disabled={locked}
          onChange={(e) => setEmoji(e.target.value)} onBlur={save} onKeyDown={blurOnEnter} className="w-14 text-center" />
        <Input aria-label={`Name for ${habit.name}`} value={name} maxLength={40} disabled={locked} enterKeyHint="done"
          onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={blurOnEnter} className="min-w-0 flex-1" />
      </div>
      <div className="flex justify-end gap-1">
        <button type="button" aria-label={`Move ${habit.name} up`} disabled={locked || !canMove || first}
          onClick={() => onMove(-1)} className={icon}>
          <ChevronUp size={18} aria-hidden />
        </button>
        <button type="button" aria-label={`Move ${habit.name} down`} disabled={locked || !canMove || last}
          onClick={() => onMove(1)} className={icon}>
          <ChevronDown size={18} aria-hidden />
        </button>
        <button type="button" aria-label={`Delete ${habit.name}`} disabled={locked} onClick={onDelete} className={icon}>
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
