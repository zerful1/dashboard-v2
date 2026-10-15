import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * Adding a habit. When it's the first, it says what the feature is for. No
 * hairline of its own: in edit mode it sits under the list's closing one.
 */
export function AddHabitForm({ first, onAdd }: { first: boolean; onAdd: (name: string, emoji: string | null) => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, emoji.trim() || null);
    setName("");
    setEmoji("");
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="lbl">{first ? "Your first habit" : "Add a habit"}</div>
      {first && <p className="text-sm text-muted">Add a daily habit, then tick it off from Home.</p>}
      <div className="flex gap-2">
        <Input aria-label="Emoji (optional)" placeholder="🙂" value={emoji} maxLength={16}
          onChange={(e) => setEmoji(e.target.value)} className="w-14 text-center" />
        <Input aria-label="Habit name" placeholder="e.g. Stretch 10 min" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
      </div>
      <Button type="submit" className="w-full" disabled={!name.trim()}>
        Add habit
      </Button>
    </form>
  );
}
