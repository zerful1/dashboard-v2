import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useOnline } from "@/hooks/useOnline";
import { BUILD_DATE, BUILD_SHA, versionText } from "@/lib/buildInfo";
import { refreshApp } from "@/lib/refreshApp";

/** The version running, and a way to get the latest (redesign part 8, §5). */
export function AppSection() {
  const qc = useQueryClient();
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <h2 className="lbl">App</h2>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="tnum text-sm text-muted">{versionText(BUILD_SHA, BUILD_DATE)}</span>
        {/* Not offline: with the caches emptied and no signal, nothing could load again. */}
        <Button
          variant="ghost"
          disabled={!online}
          loading={busy}
          onClick={() => {
            setBusy(true);
            void refreshApp(qc);
          }}
        >
          Refresh the app
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {online ? "For when it looks out of date. Your data stays on the server." : "Needs a connection"}
      </p>
    </Card>
  );
}
