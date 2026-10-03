import { useEffect, useState } from "react";
import { toLocalISO } from "@dashboard/shared";

/**
 * Today's local date, kept current. A phone keeps the app alive for days, so a
 * date read once at mount goes stale overnight. Re-read when the app comes back
 * to the foreground - the moment it matters - and once a minute while it stays
 * on screen across midnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(toLocalISO);
  useEffect(() => {
    // Setting the same string again is a no-op render, so no comparison needed.
    const check = () => setToday(toLocalISO());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);
  return today;
}
