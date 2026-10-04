import { useRef, useState, type FormEvent } from "react";
import { hitToChoice, itemToChoice, type FoodChoice } from "@dashboard/shared";
import { nutritionApi } from "@/api/nutrition";
import { ApiError } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useBarcodeCamera, type CameraState } from "./useBarcodeCamera";

const CODE = /^\d{8,14}$/;
const CAMERA_TEXT: Record<CameraState, string> = {
  starting: "Starting the camera…",
  scanning: "Point the camera at a barcode.",
  denied: "Camera access was refused. Type the barcode below instead.",
  unavailable: "No camera here. Type the barcode below instead.",
};

type Status =
  | { kind: "scanning" }
  | { kind: "looking" }
  | { kind: "missing"; code: string }
  | { kind: "failed"; message: string };

/** The camera lives only while scanning: unmounting it releases the stream. */
function CameraView({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const state = useBarcodeCamera(video, onCode);
  return (
    <div className="space-y-2">
      {(state === "starting" || state === "scanning") && (
        <video ref={video} aria-label="Camera" muted playsInline autoPlay className="aspect-[4/3] w-full rounded-card bg-black object-cover" />
      )}
      <p className="text-sm text-muted">{CAMERA_TEXT[state]}</p>
    </div>
  );
}

/**
 * Scan or type a barcode, then go to the amount step. A library food comes
 * back as its item (logging links to it); an unknown one offers the Custom
 * form with the barcode attached (spec §3).
 */
export function ScanTab({ onFound, onAddYourself }: {
  onFound: (choice: FoodChoice) => void;
  onAddYourself: (barcode: string) => void;
}) {
  const online = useOnline();
  const [status, setStatus] = useState<Status>({ kind: "scanning" });
  const [typed, setTyped] = useState("");

  async function lookUp(code: string) {
    setStatus({ kind: "looking" });
    try {
      const r = await nutritionApi.barcode(code);
      onFound(r.source === "library" ? itemToChoice(r.item) : hitToChoice(r.hit));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setStatus({ kind: "missing", code });
      else setStatus({ kind: "failed", message: err instanceof ApiError ? err.message : "Product lookup is unavailable right now" });
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const code = typed.trim();
    if (CODE.test(code)) void lookUp(code);
  }

  if (!online) return <p className="text-sm text-muted">Scanning needs a connection.</p>;

  return (
    <div className="space-y-3">
      {status.kind === "scanning" && <CameraView onCode={(code) => void lookUp(code)} />}
      {status.kind === "looking" && <Spinner label="Looking up the barcode" />}
      {status.kind === "missing" && (
        <div className="space-y-2">
          <p className="text-sm">That barcode isn&apos;t in Open Food Facts</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => onAddYourself(status.code)}>Add it yourself</Button>
            <Button variant="ghost" onClick={() => setStatus({ kind: "scanning" })}>Scan again</Button>
          </div>
        </div>
      )}
      {status.kind === "failed" && (
        <div className="space-y-2">
          <p className="text-sm text-muted">{status.message}</p>
          <Button variant="ghost" onClick={() => setStatus({ kind: "scanning" })}>Scan again</Button>
        </div>
      )}
      <form onSubmit={submitTyped} className="flex gap-2">
        <Input aria-label="Type the barcode" placeholder="Type the barcode" inputMode="numeric" value={typed}
          onChange={(e) => setTyped(e.target.value)} className="min-w-0 flex-1" />
        <Button type="submit" variant="ghost" disabled={!CODE.test(typed.trim())}>Look up</Button>
      </form>
    </div>
  );
}
