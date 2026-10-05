import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { evaluateRename } from "@dashboard/shared";
import type { ExerciseNameRow } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

interface Props {
  oldName: string | null;
  dayType: number;
  onClose: () => void;
  onRename: (newName: string) => void;
  isPending: boolean;
}

/**
 * The server enforces both rules; this shows the outcome BEFORE the user
 * commits, so a merge is never a surprise.
 */
export function RenameExerciseSheet({ oldName, dayType, onClose, onRename, isPending }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (oldName) setValue(oldName);
  }, [oldName]);

  const { data: names = [] } = useQuery<ExerciseNameRow[]>({
    queryKey: ["exerciseNames", user?.id ?? "anon"],
    queryFn: gymApi.listExerciseNames,
    enabled: !!user && !!oldName,
  });

  const trimmed = value.trim();
  const evaluation =
    oldName && trimmed
      ? evaluateRename(names, oldName, dayType, trimmed)
      : { sameDayCollision: false, mergeWith: null };

  const unchanged = trimmed === oldName;
  const canSave = trimmed.length > 0 && !unchanged && !evaluation.sameDayCollision;

  return (
    <Sheet open={!!oldName} onClose={onClose} title="Rename exercise">
      <div className="space-y-4">
        <Field
          label="Name"
          htmlFor="rename-input"
          error={
            evaluation.sameDayCollision
              ? "Another exercise on this day already uses that name"
              : undefined
          }
        >
          <Input
            id="rename-input"
            value={value}
            autoFocus
            aria-invalid={evaluation.sameDayCollision}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) onRename(evaluation.mergeWith ?? trimmed);
            }}
          />
        </Field>

        {evaluation.mergeWith && (
          // Renaming onto a name from another day merges their history and
          // stats. Say so before it happens — it is not reversible by renaming
          // back, because both exercises then share one name and there is no
          // record of which sets came from which.
          <p className="rounded-lg border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-caution">
            This will merge with <strong>{evaluation.mergeWith}</strong> on another day. Their
            history and stats combine.
          </p>
        )}

        <p className="text-xs text-dim">
          Renames everywhere this exercise appears, including past sessions.
        </p>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!canSave}
            loading={isPending}
            // Adopt the existing casing when merging, or the merge creates a
            // case-variant split instead of joining them.
            onClick={() => onRename(evaluation.mergeWith ?? trimmed)}
          >
            Rename
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
