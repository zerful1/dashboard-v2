import { useState } from "react";
import { toast } from "sonner";
import { toLocalISO, type DataSummary } from "@dashboard/shared";
import { exportApi } from "@/api/export";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useDataSummary } from "@/hooks/useDataSummary";
import { dayMonthYear } from "@/lib/dates";
import { RestoreSheet } from "./RestoreSheet";

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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * "Since 24 Jun 2026: 108 weigh-ins · 71 sessions · …", numbers white and
 * words muted; zero parts are left out.
 */
function SummaryLine({ s }: { s: DataSummary }) {
  const parts = [
    [s.weighIns, plural(s.weighIns, "weigh-in", "weigh-ins")],
    [s.sessions, plural(s.sessions, "session", "sessions")],
    [s.foodDays, plural(s.foodDays, "day of food", "days of food")],
    [s.habits, plural(s.habits, "habit", "habits")],
  ].filter(([n]) => (n as number) > 0) as [number, string][];
  if (parts.length === 0) return <p className="text-sm text-muted">Nothing logged yet.</p>;
  return (
    <p className="tnum text-sm text-muted">
      {s.since && `Since ${dayMonthYear(s.since)}: `}
      {parts.map(([n, word], i) => (
        <span key={word}>
          {i > 0 && " · "}
          {/* A count keeps its words on one line. */}
          <span className="whitespace-nowrap">
            <span className="text-text">{n.toLocaleString("en-GB")}</span> {word}
          </span>
        </span>
      ))}
    </p>
  );
}

/**
 * Everything the user owns, as one JSON file: their backup, since Supabase's
 * free tier keeps none they can download. Neither a query nor a mutation, so
 * nothing is cached, and the global mutation toast doesn't apply. The failure
 * message is this card's own.
 */
export function YourDataCard() {
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const summary = useDataSummary();

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
      <h2 className="lbl">Your data</h2>
      {/* Absent while loading or failed: the download doesn't depend on it. */}
      {summary.data && <SummaryLine s={summary.data} />}
      <Button variant="ghost" loading={busy} onClick={() => void onDownload()} className="w-full">
        Download my data
      </Button>
      <Button variant="ghost" onClick={() => setRestoring(true)} className="w-full">
        Restore…
      </Button>
      <RestoreSheet open={restoring} onClose={() => setRestoring(false)} />
    </Card>
  );
}
