import { useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreApi } from "@/api/restore";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { ApiError } from "@/lib/api";
import { writeFailureMessage } from "@/lib/queryClient";
import { cantSend, missingParts, packBody, readDownload, total, type PackedBody } from "./restoreFile";

/**
 * The toast's own words, since both mutations opt out of it: offline and
 * timed out read as the rest of the app says them, not as the browser's
 * "Failed to fetch". demoReadOnly's words are about saving; this says what
 * can't happen here.
 */
const message = (err: Error) =>
  err instanceof ApiError && err.status === 403 ? "The demo can't restore downloads." : writeFailureMessage(err);

/**
 * The sheet's body. It lives inside the Sheet, which unmounts it on close, so
 * every opening starts from a clean file input with no old preview or error.
 */
function RestoreBody({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [packed, setPacked] = useState<PackedBody | null>(null);
  // Why a picked file was never sent: not a download, or too large.
  const [refused, setRefused] = useState<string | null>(null);
  const picks = useRef(0);

  // Both show their failure here, never as a toast (redesign part 8, §6.1).
  const preview = useMutation({ mutationFn: (p: PackedBody) => restoreApi.preview(p), meta: { errorToast: false } });
  const restore = useMutation({
    mutationFn: (p: PackedBody) => restoreApi.restore(p),
    meta: { errorToast: false },
    onSuccess: ({ added }) => {
      void qc.invalidateQueries();
      onDone();
      const n = total(added);
      // Another device can restore the same file between the preview and this.
      toast.success(
        n === 0 ? "Everything in this file is already here" : `Added back ${n} ${n === 1 ? "thing" : "things"}`,
      );
    },
  });

  async function onPick(file: File | undefined) {
    // Reading and packing take a moment, so a newer pick can overtake this
    // one; whichever finishes last must not put the older file on screen.
    const pick = ++picks.current;
    preview.reset();
    restore.reset();
    setPacked(null);
    setRefused(null);
    if (!file) return;
    const read = await readDownload(file);
    if (pick !== picks.current) return;
    if ("refused" in read) return setRefused(read.refused);
    const body = await packBody(read.text);
    if (pick !== picks.current) return;
    const unsendable = cantSend(body);
    if (unsendable) return setRefused(unsendable);
    setPacked(body);
    preview.mutate(body);
  }

  const error = restore.error ?? preview.error;
  const parts = preview.data && missingParts(preview.data.added);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="restore-file" className="lbl block">
          Your download
        </label>
        <input
          id="restore-file"
          type="file"
          accept="application/json,.json"
          // A restore still running would finish after a new pick, and close
          // the sheet on a file it never sent.
          disabled={restore.isPending}
          onChange={(e) => void onPick(e.target.files?.[0])}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-edge
                     file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-text"
        />
      </div>

      {refused && <FormError>{refused}</FormError>}
      {preview.isPending && <p className="text-sm text-muted">Checking the file…</p>}
      {error && <FormError>{message(error)}</FormError>}

      {parts && parts.length === 0 && <p className="text-sm text-muted">Everything in this file is already here.</p>}
      {parts && parts.length > 0 && (
        <>
          <p className="tnum text-sm">{parts.join(" · ")}</p>
          <p className="text-sm text-muted">
            Everything else in the file is already here. Nothing in your account will change or be removed.
          </p>
          <Button className="w-full" loading={restore.isPending} onClick={() => packed && restore.mutate(packed)}>
            Add them back
          </Button>
        </>
      )}
    </div>
  );
}

/** Restore from a download (redesign part 8, §6): a preview of what's missing, then one button. */
export function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Restore from a download">
      <RestoreBody onDone={onClose} />
    </Sheet>
  );
}
