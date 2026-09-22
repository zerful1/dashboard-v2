import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

/**
 * Security headers, asserted rather than eyeballed once in a browser.
 *
 * helmet sets these, so the test doubles as the check that helmet is still
 * mounted at all — a middleware that silently stops being applied is otherwise
 * invisible until someone runs a scanner.
 */
describe("security headers", () => {
  it("sets nosniff and denies framing", async () => {
    const res = await request(app).get("/api/health").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    // Clickjacking: the app is never meant to be embedded.
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("does not advertise Express", async () => {
    // app.disable("x-powered-by") was removed when helmet arrived, on the
    // grounds that helmet does it. This is what makes that claim checkable.
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets them on an error response too, not just a happy path", async () => {
    // Headers set by middleware can be lost on paths that bypass it. 401 is the
    // most common response this API gives an unauthenticated caller.
    const res = await request(app).get("/api/profile").expect(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("still sends the credentialed CORS headers", async () => {
    // helmet is mounted before the CORS middleware, so this pins that it did
    // not displace it — a wildcard or a missing origin here would stop the
    // session cookie being sent at all.
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
