import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "../src/lib/api";

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
