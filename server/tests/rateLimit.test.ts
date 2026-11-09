import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { rateLimit } from "../src/middleware/rateLimit";
import { errorHandler } from "../src/middleware/errorHandler";

/** A bare app around one limiter, with a clock the test moves. */
function limited(max: number, windowMs: number) {
  const clock = { t: 1_000_000 };
  const app = express();
  app.use(rateLimit({ max, windowMs, now: () => clock.t }));
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return { app, clock };
}

describe("rateLimit", () => {
  it("lets `max` requests through, then answers 429 with Retry-After", async () => {
    const { app, clock } = limited(2, 60_000);
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
    clock.t += 15_000;
    const res = await request(app).get("/").expect(429);
    expect(res.body.error).toBe("too_many_requests");
    // What is left of the window, in seconds.
    expect(res.headers["retry-after"]).toBe("45");
  });

  it("starts again when the window ends", async () => {
    const { app, clock } = limited(1, 60_000);
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(429);
    clock.t += 60_000;
    await request(app).get("/").expect(200);
  });

  it("counts each key on its own, and skips a request with none", async () => {
    const app = express();
    app.use(rateLimit({ max: 1, windowMs: 60_000, key: (req) => (req.query.k as string | undefined) ?? null }));
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    await request(app).get("/?k=a").expect(200);
    await request(app).get("/?k=b").expect(200);
    await request(app).get("/?k=a").expect(429);
    // No key: never counted, however many.
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
  });
});

describe("the app's limits", () => {
  const login = { email: "nobody@example.com", password: "wrong-password-1" };

  it("stops a run of sign-in attempts from one address", async () => {
    const app = createApp({ rateLimits: true });
    // 30 are let through to be refused as wrong; the 31st is not looked at.
    for (let i = 0; i < 30; i++) await request(app).post("/api/auth/login").send(login).expect(401);
    const res = await request(app).post("/api/auth/login").send(login).expect(429);
    expect(res.body.message).toMatch(/too many/i);
  });

  it("never counts sign-out or a read", async () => {
    const app = createApp({ rateLimits: true });
    for (let i = 0; i < 30; i++) await request(app).post("/api/auth/login").send(login).expect(401);
    await request(app).post("/api/auth/login").send(login).expect(429);
    // Past the limit, leaving still works and /me still answers as itself.
    await request(app).post("/api/auth/logout").expect(204);
    await request(app).get("/api/auth/me").expect(401);
  });

  it("limits resets per address asked about, account or not", async () => {
    const app = createApp({ rateLimits: true });
    const ask = (email: string) => request(app).post("/api/auth/forgot-password").send({ email });
    for (let i = 0; i < 5; i++) await ask("Someone@Example.com").expect(204);
    // Same address in another spelling: one inbox, one count.
    await ask(" someone@example.com").expect(429);
    // Another address from the same caller is still answered.
    await ask("other@example.com").expect(204);
  });

  it("is off for the rest of the suite, which shares one address", async () => {
    const app = createApp();
    for (let i = 0; i < 31; i++) await request(app).post("/api/auth/login").send(login).expect(401);
  });
});
