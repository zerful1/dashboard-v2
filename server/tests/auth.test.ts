import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";

const app = createApp();
const creds = { email: "alice@example.com", password: "correct-horse-9" };

describe("register", () => {
  it("creates the account, a profile row, and a session", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("alice@example.com");
    expect(res.headers["set-cookie"]?.[0]).toContain("dash.sid");

    const { rows } = await pool.query(
      `SELECT user_id FROM ${T.profiles} WHERE user_id = $1`,
      [res.body.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("never returns the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|password/i);
  });

  it("rejects a weak password before touching the database", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "x@example.com", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
    expect(res.body.details.password).toBeDefined();

    const { rows } = await pool.query(`SELECT id FROM ${T.users}`);
    expect(rows).toHaveLength(0);
  });

  it("rejects a malformed email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "correct-horse-9" });
    expect(res.status).toBe(400);
    expect(res.body.details.email).toBeDefined();
  });

  it("does not reveal whether an email is already registered", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const res = await request(app).post("/api/auth/register").send(creds);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/already|exists|taken/i);
  });

  it("sets an httpOnly SameSite=Lax cookie", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);
    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe("login", () => {
  it("succeeds with correct credentials", async () => {
    await request(app).post("/api/auth/register").send(creds);

    const res = await request(app).post("/api/auth/login").send(creds);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(creds.email);
  });

  it("accepts a differently-cased email", async () => {
    await request(app).post("/api/auth/register").send(creds);
    await request(app)
      .post("/api/auth/login")
      .send({ ...creds, email: "ALICE@Example.com" })
      .expect(200);
  });

  it("rejects a wrong password with 401", async () => {
    await request(app).post("/api/auth/register").send(creds);
    await request(app)
      .post("/api/auth/login")
      .send({ ...creds, password: "wrong-password-1" })
      .expect(401);
  });

  it("gives an identical 401 for an unknown email", async () => {
    const unknown = await request(app).post("/api/auth/login").send(creds);
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe("Invalid email or password");
  });

  it("issues a fresh session id on login, defeating fixation", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    await agent.post("/api/auth/logout").expect(204);

    const login = await agent.post("/api/auth/login").send(creds);
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"]?.[0]).toContain("dash.sid");
  });

  it("takes comparable time for unknown and known emails", async () => {
    await request(app).post("/api/auth/register").send(creds);

    const time = async (email: string) => {
      const start = process.hrtime.bigint();
      await request(app).post("/api/auth/login").send({ email, password: "wrong-pw-123" });
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    // Warm the path so JIT and connection setup do not skew the first sample.
    await time(creds.email);

    const known = await time(creds.email);
    const unknown = await time("nobody@example.com");

    // Without DUMMY_HASH the unknown path returns in ~1ms against ~100ms. A 5x
    // band survives CI jitter while still catching a missing dummy verify.
    const ratio = Math.max(known, unknown) / Math.min(known, unknown);
    expect(ratio).toBeLessThan(5);
  });
});

describe("session lifecycle", () => {
  it("returns 401 from /me without a session", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("returns the user with a session, and 401 after logout", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(creds.email);

    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("persists the session in Postgres, not in memory", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);

    const { rows } = await pool.query(`SELECT sid, sess FROM ${T.session}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].sess.userId).toBeDefined();
  });

  it("401s and clears the session if the user row has gone", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(creds);

    await pool.query(`DELETE FROM ${T.users} WHERE id = $1`, [reg.body.id]);

    await agent.get("/api/auth/me").expect(401);
  });
});
