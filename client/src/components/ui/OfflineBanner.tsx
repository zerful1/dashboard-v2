import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * `navigator.onLine` is only ever trustworthy when false — true means "there is
 * a network interface", not "the internet is reachable". That asymmetry is
 * exactly right here: a false positive would hide the banner from someone who
 * really is offline, and false only ever means genuinely disconnected.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

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
