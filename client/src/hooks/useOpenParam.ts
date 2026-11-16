import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/** Opens a sheet from `?open=<name>`, once on mount then removed with replace; call above any early return. */
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
