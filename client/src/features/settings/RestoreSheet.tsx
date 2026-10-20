import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreApi } from "@/api/restore";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { ApiError } from "@/lib/api";
import { missingParts, packBody, readDownload, total, type PackedBody } from "./restoreFile";

const message = (err: Error) =>
  // demoReadOnly's own words are about saving; this says what can't happen here.
  err instanceof ApiError && err.status === 403 ? "The demo can't restore downloads." : err.message;

/**
 * The sheet's body. It lives inside the Sheet, which unmounts it on close, so
 * every opening starts from a clean file input with no old preview or error.
 */
function RestoreBody({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [packed, setPacked] = useState<PackedBody | null>(null);
  const [notADownload, setNotADownload] = useState(false);

  // Both show their failure here, never as a toast (redesign part 8, §6.1).
  const preview = useMutation({ mutationFn: (p: PackedBody) => restoreApi.preview(p), meta: { errorToast: false } });
  const restore = useMutation({
    mutationFn: (p: PackedBody) => restoreApi.restore(p),
    meta: { errorToast: false },
    onSuccess: ({ added }) => {
      void qc.invalidateQueries();
      onDone();
      const n = total(added);
      toast.success(`Added back ${n} ${n === 1 ? "thing" : "things"}`);
    },
  });

  async function onPick(file: File | undefined) {
    preview.reset();
    restore.reset();
    setPacked(null);
    setNotADownload(false);
    if (!file) return;
    const text = await readDownload(file);
    if (text === null) {
      setNotADownload(true);
      return;
    }
    const body = await packBody(text);
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
          onChange={(e) => void onPick(e.target.files?.[0])}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-edge
                     file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-text"
        />
      </div>

      {notADownload && <FormError>This isn't a dashboard download</FormError>}
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
