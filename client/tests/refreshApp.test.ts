import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshApp } from "../src/lib/refreshApp";
import { persister } from "../src/lib/persister";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("refreshApp", () => {
  it("clears the cache, the persisted copy and the worker, then reloads", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["profile"], { timezone: "UTC" });
    const removeClient = vi.spyOn(persister, "removeClient").mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { keys: vi.fn().mockResolvedValue(["a", "b"]), delete: del });
    const unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    const reload = vi.fn();

    await refreshApp(qc, reload);

    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(removeClient).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("a");
    expect(del).toHaveBeenCalledWith("b");
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
