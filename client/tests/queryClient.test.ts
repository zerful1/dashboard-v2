import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { createQueryClient } from "../src/lib/queryClient";
import { ApiError } from "../src/lib/api";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => vi.mocked(toast.error).mockClear());

async function failWith(options: { onError?: () => void }): Promise<void> {
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
});
