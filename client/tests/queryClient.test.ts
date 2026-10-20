import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MutationObserver, QueryObserver, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { createQueryClient } from "../src/lib/queryClient";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => vi.mocked(toast.error).mockClear());

async function failWith(options: { onError?: () => void; meta?: Record<string, unknown> }): Promise<void> {
  const observer = new MutationObserver(createQueryClient(), {
    mutationFn: () => Promise.reject(new ApiError(500, "Could not save")),
    retry: false,
    ...options,
  });
  await observer.mutate(undefined).catch(() => {});
}

describe("mutation failures", () => {
  // CLAUDE.md: per-hook handlers roll back only, and the global handler owns
  // the message. A hook's own onError REPLACES defaultOptions.mutations.onError
  // (TanStack merges them with a plain spread), so every rollback hook in the
  // app used to fail without a word. Found in the browser.
  it("toasts once even when the mutation rolls back in its own onError", async () => {
    const rollback = vi.fn();
    await failWith({ onError: rollback });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Could not save");
  });

  // The complement: moving the handler must not double up where there is no
  // hook-level onError at all.
  it("toasts once, not twice, when the mutation has no onError of its own", async () => {
    await failWith({});
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // CLAUDE.md, as for queries: a screen that shows its own failure opts out.
  it("stays quiet for a write whose screen shows its own failure", async () => {
    await failWith({ meta: { errorToast: false } });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("writes made offline", () => {
  afterEach(() => onlineManager.setOnline(true));

  // CLAUDE.md: writes are not queued offline, in any feature. TanStack's default
  // PAUSES a write while offline and replays it on reconnect, so it looks saved
  // and is lost if the app closes first. A default here covers every hook,
  // including ones not written yet - this mutation sets no networkMode itself.
  it("fail with a toast instead of waiting for the signal", async () => {
    onlineManager.setOnline(false);
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => Promise.reject(new TypeError("Failed to fetch")),
      retry: false,
    });
    void observer.mutate(undefined).catch(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(observer.getCurrentResult().isPaused).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // #17 review (53): "Something went wrong" read as an unexplained fault beside
  // a banner that already said changes won't save.
  it("say the device is offline", async () => {
    onlineManager.setOnline(false);
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => Promise.reject(new TypeError("Failed to fetch")),
      retry: false,
    });
    await observer.mutate(undefined).catch(() => {});
    expect(toast.error).toHaveBeenCalledWith("You're offline — not saved");
  });

  // Final review: TanStack's onlineManager starts online and changes only on an
  // online/offline event, so an app opened with no signal (no event ever fires)
  // still showed "Something went wrong" beside the offline banner.
  it("say the device is offline when the app was opened with no signal", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      const observer = new MutationObserver(createQueryClient(), {
        mutationFn: () => Promise.reject(new TypeError("Failed to fetch")),
        retry: false,
      });
      await observer.mutate(undefined).catch(() => {});
      expect(toast.error).toHaveBeenCalledWith("You're offline — not saved");
    } finally {
      onLine.mockRestore();
    }
  });

  // Housekeeping item 28: a write that gave up after 15 s says so, rather than
  // the bare "Timed out". Not "not saved": a slow write can still land after
  // the app gave up, and the refetch on settle shows whether it did.
  it("say a timed-out write may not have saved", async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => Promise.reject(new ApiError(0, "Timed out", "timeout")),
      retry: false,
    });
    await observer.mutate(undefined).catch(() => {});
    expect(toast.error).toHaveBeenCalledWith("Timed out — may not have saved");
  });

  it("keep the general message for a network failure while online", async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => Promise.reject(new TypeError("Failed to fetch")),
      retry: false,
    });
    await observer.mutate(undefined).catch(() => {});
    expect(toast.error).toHaveBeenCalledWith("Something went wrong");
  });
});

// #35's final review: TanStack's onlineManager starts online and changes only on
// an online/offline event, so an app opened with no signal fetched anyway, and
// every query failed and toasted over the data it had saved.
describe("an app opened with no signal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
  });

  it("starts offline when the device says it is", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    createQueryClient();
    expect(onlineManager.isOnline()).toBe(false);
  });

  // The complement: navigator.onLine true only means "there is a network
  // interface" (useOnline), so it proves nothing and changes nothing.
  it("leaves TanStack's own state alone when the device says it's online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    createQueryClient();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("pauses a query over its saved data instead of failing it", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const qc = createQueryClient();
    qc.setQueryData(["saved"], "yesterday's");
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const observer = new QueryObserver(qc, { queryKey: ["saved"], queryFn: fetcher, staleTime: 0, retry: false });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await new Promise((r) => setTimeout(r, 20));
      expect(observer.getCurrentResult()).toMatchObject({ data: "yesterday's", fetchStatus: "paused", isError: false });
      expect(fetcher).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
});

// A query on dead wifi took about 31 s to fail: 15 s, a retry, and 15 s more.
describe("createQueryClient's retry", () => {
  const fetchCount = async (err: Error) => {
    const queryFn = vi.fn(() => Promise.reject(err));
    await createQueryClient().fetchQuery({ queryKey: ["x"], queryFn, retryDelay: 0 }).catch(() => {});
    return queryFn.mock.calls.length;
  };

  it("doesn't retry a query that timed out", async () => {
    expect(await fetchCount(new ApiError(0, "Timed out", "timeout"))).toBe(1);
  });

  it("still retries any other failure once", async () => {
    expect(await fetchCount(new ApiError(500, "boom"))).toBe(2);
  });
});
