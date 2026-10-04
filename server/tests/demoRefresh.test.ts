import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { findUserByEmail } from "../src/repositories/users";
import { DEMO_EMAIL, findOrCreateDemoUser, isDemoEmail } from "../src/demo/account";
import { refreshDemoIfStale } from "../src/demo/refresh";

const app = createApp();
const count = async (table: string, userId: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId])).rows[0]!.n;

describe("demo account", () => {
  it("is created once, named Demo, in London time", async () => {
    const a = await findOrCreateDemoUser();
    const b = await findOrCreateDemoUser();
    expect(b.id).toBe(a.id);
    expect(a.email).toBe(DEMO_EMAIL);
    const { rows } = await pool.query(`SELECT display_name, timezone FROM ${T.profiles} WHERE user_id = $1`, [a.id]);
    expect(rows[0]).toEqual({ display_name: "Demo", timezone: "Europe/London" });
    expect(isDemoEmail(" Demo@Demo.invalid ")).toBe(true);
  });

  // Review focus 1.
  it("two first visits get the same account", async () => {
    const [a, b] = await Promise.all([findOrCreateDemoUser(), findOrCreateDemoUser()]);
    expect(a.id).toBe(b.id);
  });
});

describe("demo refresh", () => {
  it("fills an empty demo account, then leaves fresh data alone", async () => {
    const demo = await findOrCreateDemoUser();
    expect(await refreshDemoIfStale(demo.id, "2026-10-04")).toBe(true);
    expect(await count(T.workoutSets, demo.id)).toBeGreaterThan(500);
    expect(await count(T.foodLogEntries, demo.id)).toBeGreaterThan(100);
    expect(await count(T.goals, demo.id)).toBe(3);
    const before = (await pool.query(`SELECT id FROM ${T.bodyWeight} WHERE user_id = $1 ORDER BY date`, [demo.id])).rows;

    expect(await refreshDemoIfStale(demo.id, "2026-10-04")).toBe(false);
    const after = (await pool.query(`SELECT id FROM ${T.bodyWeight} WHERE user_id = $1 ORDER BY date`, [demo.id])).rows;
    expect(after).toEqual(before);
  });

  it("regenerates around a later day, replacing rather than adding", async () => {
    const demo = await findOrCreateDemoUser();
    await refreshDemoIfStale(demo.id, "2026-10-04");
    const goals = await count(T.goals, demo.id);
    expect(await refreshDemoIfStale(demo.id, "2026-10-09")).toBe(true);
    const newest = (await pool.query(`SELECT max(date)::text AS d FROM ${T.bodyWeight} WHERE user_id = $1`, [demo.id])).rows[0].d;
    expect(newest).toBe("2026-10-08");
    expect(await count(T.goals, demo.id)).toBe(goals);
  });

  it("never touches another account's rows", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "alice@example.com", password: "correct-horse-9" });
    const alice = (await findUserByEmail("alice@example.com"))!.id;
    await agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 79 }).expect(201);
    await agent.put("/api/goals/weight").send({ target_kg: 75 }).expect(200);

    const demo = await findOrCreateDemoUser();
    await refreshDemoIfStale(demo.id, "2026-10-04");
    await refreshDemoIfStale(demo.id, "2026-10-09");
    expect(await count(T.bodyWeight, alice)).toBe(1);
    expect(await count(T.goals, alice)).toBe(1);
  });
});
