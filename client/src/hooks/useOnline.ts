import { useEffect, useState } from "react";

/**
 * `navigator.onLine` is only trustworthy when false - true means "there is a
 * network interface", not "the internet is reachable". That asymmetry is right
 * for both callers: a false "offline" would hide something from someone who
 * is really online, and false only ever means genuinely disconnected.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
