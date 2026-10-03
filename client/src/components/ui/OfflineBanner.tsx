import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

// Why navigator.onLine is trusted only when false: see useOnline.
export function OfflineBanner() {
  const offline = !useOnline();

  if (!offline) return null;

  return (
    <div
      // Announced when it appears, but not interrupting: being offline is worth
      // knowing, not worth cutting across whatever is being read.
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-raised px-4 py-1.5 text-xs text-muted"
    >
      <WifiOff size={13} />
      <span>Offline — showing saved data. Changes won&rsquo;t save.</span>
    </div>
  );
}
