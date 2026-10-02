import { describe, it, expect, vi, beforeEach } from "vitest";
import { MutationObserver } from "@tanstack/react-query";
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
