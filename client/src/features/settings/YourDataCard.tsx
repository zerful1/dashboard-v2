import { useState } from "react";
import { toast } from "sonner";
import { toLocalISO } from "@dashboard/shared";
import { exportApi } from "@/api/export";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/** Hands the browser a file to save, through a temporary link. */
function saveJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not revoked at once: Safari can still be reading the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Everything the user owns, as one JSON file: their backup, since Supabase's
 * free tier keeps none they can download. Neither a query nor a mutation, so
 * nothing is cached, and the global mutation toast doesn't apply. The failure
 * message is this card's own.
 */
export function YourDataCard() {
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      saveJson(`dashboard-export-${toLocalISO()}.json`, await exportApi.download());
    } catch {
      toast.error("Couldn't download your data. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="lbl">Your data</div>
      <p className="text-sm text-muted">Everything you&apos;ve logged, as one JSON file.</p>
      <Button variant="ghost" loading={busy} onClick={() => void onDownload()} className="w-full">
        Download my data
      </Button>
    </Card>
  );
}
