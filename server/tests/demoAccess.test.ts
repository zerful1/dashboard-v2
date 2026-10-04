import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { parseSignupPolicy } from "../src/signups";
import { DEMO_EMAIL } from "../src/demo/account";

const app = createApp();
const READ_ONLY = "This is a read-only demo — nothing you change is saved";

async function inDemo(a = app) {
  const agent = request.agent(a);
  await agent.post("/api/auth/demo").expect(200);
  return agent;
}

describe("demo entry", () => {
  it("signs in to a populated demo and says so", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/demo").expect(200);
    expect(res.body).toMatchObject({ email: DEMO_EMAIL, demo: true });
    expect((await agent.get("/api/auth/me").expect(200)).body).toMatchObject({ demo: true });
    expect((await agent.get("/api/weight").expect(200)).body.length).toBeGreaterThan(50);
  });

  // Review focus 3.
  it("opens with sign-ups closed", async () => {
    const closed = createApp({ signups: parseSignupPolicy(undefined) });
    await request.agent(closed).post("/api/auth/demo").expect(200);
  });
});

describe("demo is read-only", () => {
  // Review focus 4: not only the obvious writes.
  it("refuses every kind of write", async () => {
    const agent = await inDemo();
    const writes = [
      agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 70 }),
      agent.put("/api/goals/weight").send({ target_kg: 70 }),
      agent.patch("/api/profile").send({ display_name: "Hacked" }),
      agent.delete("/api/profile").send({ password: "x" }),
      agent.post("/api/auth/change-password").send({ currentPassword: "x", newPassword: "correct-horse-10" }),
      agent.post("/api/workouts/sets").send({ date: "2026-10-01", day_type: 1, exercise_name: "Squat", set_number: 1, weight_kg: 100, reps: 5 }),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(READ_ONLY);
    }
  });

  it("still reads, and still signs out", async () => {
    const agent = await inDemo();
    await agent.get("/api/insights/records").expect(200);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("leaves a normal session free to write", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "alice@example.com", password: "correct-horse-9" });
    await agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 79 }).expect(201);
    expect((await agent.get("/api/auth/me")).body.demo).toBe(false);
  });
});

describe("the demo account has no other way in", () => {
  it("refuses password login, reset and sign-up for the demo email", async () => {
    await inDemo(); // the account exists
    await request(app).post("/api/auth/login").send({ email: DEMO_EMAIL, password: "anything-at-all" }).expect(401);
    await request(app).post("/api/auth/forgot-password").send({ email: DEMO_EMAIL }).expect(204);
    const tokens = await pool.query(
      `SELECT count(*)::int AS n FROM ${T.passwordResetTokens} t JOIN ${T.users} u ON u.id = t.user_id WHERE u.email = $1`,
      [DEMO_EMAIL],
    );
    expect(tokens.rows[0].n).toBe(0);
    await request(app).post("/api/auth/register").send({ email: DEMO_EMAIL, password: "correct-horse-9" }).expect(409);
  });
});
