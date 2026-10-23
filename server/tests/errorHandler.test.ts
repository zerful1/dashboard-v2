import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

/**
 * A body express.json() can't parse never reaches a route, so it arrives at the
 * error handler as a plain http-errors object rather than an AppError. Treated as
 * unexpected, it answered 500 and logged the raw body — a password, on /login.
 */
describe("a body the JSON parser rejects", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is a 400, and the raw body is not logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":"a@example.com","password":"hunter2"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request", message: "Malformed request body" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("hunter2");
  });

  it("is a 413 when it is over the limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@example.com", password: "x".repeat(1_100_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("payload_too_large");
  });

  it("leaves a well-formed request to the route", async () => {
    // The positive complement: a 400 from the handler for every body would pass
    // the tests above. A wrong password is the route's own 401.
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password-1" });

    expect(res.status).toBe(401);
  });
});
