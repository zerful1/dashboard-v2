import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, API_TIMEOUT_MS } from "../src/lib/api";

function mockFetch(status: number, body?: unknown, ok = status < 400) {
  const text = body === undefined ? "" : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("always sends credentials so the session cookie travels", async () => {
    const f = mockFetch(200, { ok: true });
    vi.stubGlobal("fetch", f);

    await api("/api/health");

    expect(f.mock.calls[0]![1].credentials).toBe("include");
  });

  it("sets JSON content type for a normal body but not for FormData", async () => {
    const f = mockFetch(200, {});
    vi.stubGlobal("fetch", f);

    await api("/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(f.mock.calls[0]![1].headers["Content-Type"]).toBe("application/json");

    await api("/y", { method: "POST", body: new FormData() });
    expect(f.mock.calls[1]![1].headers["Content-Type"]).toBeUndefined();
  });

  it("returns undefined for an empty body rather than throwing", async () => {
    vi.stubGlobal("fetch", mockFetch(204));
    await expect(api("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws ApiError carrying status, code and field details", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(400, {
        error: "bad_request",
        message: "Validation failed",
        details: { password: "Password must be at least 8 characters" },
      }),
    );

    const err = (await api("/api/auth/register", { method: "POST" }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.details?.password).toContain("8 character");
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
        text: async () => "<html>gateway</html>",
      }),
    );

    const err = (await api("/x").catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toBe("Something went wrong");
  });
});

/**
 * A fetch that honours its signal, as the real one does, body included: it
 * answers after `answerAfter` ms (never, if undefined), and its body after
 * `bodyAfter` more. An abort rejects whichever is still waiting.
 */
function slowFetch(answerAfter?: number, bodyAfter = 0) {
  const aborted = (signal: AbortSignal | null | undefined, reject: (e: unknown) => void) =>
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  return vi.fn((_path: string, init: RequestInit) =>
    new Promise((resolve, reject) => {
      aborted(init.signal, reject);
      if (answerAfter === undefined) return;
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        text: () => new Promise((r, rj) => {
          aborted(init.signal, rj);
          setTimeout(() => r('{"a":1}'), bodyAfter);
        }),
      }), answerAfter);
    }),
  );
}

/** Whether the promise has settled yet, without awaiting it. */
function track<T>(p: Promise<T>) {
  const state = { settled: false, value: undefined as unknown };
  p.then((v) => Object.assign(state, { settled: true, value: v }), (e) => Object.assign(state, { settled: true, value: e }));
  return state;
}

// Housekeeping item 28: dead wifi left a request pending for good.
describe("api, on a connection that never answers", () => {
  afterEach(() => vi.useRealTimers());

  it("gives up after 15 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", slowFetch());
    const call = track(api("/api/x"));
    // Review focus 1: not a moment early.
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.value).toBeInstanceOf(ApiError);
    expect(call.value).toMatchObject({ status: 0, code: "timeout", message: "Timed out" });
  });

  it("does not time out a quick answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", slowFetch(100));
    const call = track(api("/api/x"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(call.value).toEqual({ a: 1 });
  });

  // Only the wait for an answer is timed: the export streams every row, and a
  // slow body arriving is progress, not a dead connection.
  it("does not cut off a slow body once the answer has started", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", slowFetch(100, 30_000));
    const call = track(api("/api/export"));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(call.value).toEqual({ a: 1 });
  });

  it("still lets the caller abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", slowFetch());
    const caller = new AbortController();
    const call = track(api("/api/x", { signal: caller.signal }));
    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(call.settled).toBe(true);
    expect(call.value).toBeInstanceOf(DOMException);
    expect((call.value as { code?: unknown }).code).not.toBe("timeout");
  });
});
