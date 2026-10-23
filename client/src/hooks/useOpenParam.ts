import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Opens a page's sheet from `?open=<name>`: Settings' shortcuts link here.
 * Read once on mount, then removed with `replace`, so
 * Back and a reload don't open it again. Call it beside the sheet's state,
 * above any early return: a page that spins first still opens once it draws.
 */
export function useOpenParam(name: "split" | "targets" | "goals", open: () => void): void {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("open") !== name) return;
    open();
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
    // Once, on mount: later changes to the URL are not a request to open.
  }, []);
}
