import { useEffect, useState } from "react";
import { toLocalISO } from "@dashboard/shared";

/** Today's local date, re-read on foreground and once a minute, since a phone keeps the app alive past midnight. */
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
