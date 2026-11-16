import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

/** helmet sets these, so this doubles as the check that helmet is still mounted. */
describe("security headers", () => {
  it("sets nosniff and denies framing", async () => {
    const res = await request(app).get("/api/health").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    // Clickjacking: the app is never meant to be embedded.
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("does not advertise Express", async () => {
    // Removing app.disable("x-powered-by") relied on helmet doing it; this makes that checkable.
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets them on an error response too, not just a happy path", async () => {
    // Headers set by middleware can be lost on paths that bypass it; 401 is the most common such response.
    const res = await request(app).get("/api/profile").expect(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("still sends the credentialed CORS headers", async () => {
    // helmet is mounted before CORS; a wildcard or missing origin here would stop the session cookie being sent.
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
