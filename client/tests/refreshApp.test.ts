import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshApp } from "../src/lib/refreshApp";
import { persister } from "../src/lib/persister";

/** /api/health answering as the server does; a captive portal answers HTML. */
const health = (ok: boolean) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => (ok ? { ok: true } : Promise.reject(new Error("html"))) }));

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
    health(true);

    expect(await refreshApp(qc, reload)).toBe(true);

    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(removeClient).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("a");
    expect(del).toHaveBeenCalledWith("b");
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Final review: a recovery button that spins forever recovers nothing.
  it("still reloads when a step fails", async () => {
    health(true);
    vi.spyOn(persister, "removeClient").mockRejectedValue(new Error("storage"));
    vi.stubGlobal("caches", { keys: vi.fn().mockRejectedValue(new Error("no")), delete: vi.fn() });
    const reload = vi.fn();
    await refreshApp(new QueryClient(), reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Final review: dead wifi reports online. Emptying the caches then would
  // leave nothing to open until there is signal.
  it("clears nothing when the server can't be reached", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["profile"], { timezone: "UTC" });
    const removeClient = vi.spyOn(persister, "removeClient").mockResolvedValue(undefined);
    const reload = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await refreshApp(qc, reload)).toBe(false);
    health(false);
    expect(await refreshApp(qc, reload)).toBe(false);
    expect(qc.getQueryCache().getAll()).toHaveLength(1);
    expect(removeClient).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
