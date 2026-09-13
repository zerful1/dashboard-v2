import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { listWeights, upsertWeight, deleteWeight } from "../src/repositories/bodyWeight";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

describe("body weight", () => {
  it("requires a session", async () => {
    await request(app).get("/api/weight").expect(401);
    await request(app).post("/api/weight").send({ date: "2026-08-15", weight_kg: 82 }).expect(401);
  });

  it("creates and lists entries newest first", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.post("/api/weight").send({ date: "2026-08-13", weight_kg: 82.4 }).expect(201);
    await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82.1 }).expect(201);

    const res = await agent.get("/api/weight").expect(200);
    expect(res.body.map((r: { date: string }) => r.date)).toEqual(["2026-08-15", "2026-08-13"]);
  });

  /*
   * The regression guard for the whole phase's reason to exist.
   *
   * node-pg parses a `date` into a JS Date at local midnight; during BST that
   * is 23:00 UTC the previous day, so serialising it back yields the day
   * before. It is correct during GMT, so a suite that only used winter dates
   * would pass while half of ten months of history silently shifted.
   * 26 September is inside BST — the same date, as it happens, as the earliest
   * migrated session.
   */
  it("returns dates as plain strings, unshifted", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.post("/api/weight").send({ date: "2025-09-26", weight_kg: 84 }).expect(201);

    const res = await agent.get("/api/weight").expect(200);
    expect(res.body[0].date).toBe("2025-09-26");
    expect(typeof res.body[0].date).toBe("string");
  });

  it("upserts rather than duplicating a day", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82.4 }).expect(201);
    await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 81.9 }).expect(201);

    const res = await agent.get("/api/weight").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].weight_kg).toBe(81.9);
  });

  it("rejects a malformed date and a non-positive weight", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.post("/api/weight").send({ date: "15/08/2026", weight_kg: 82 }).expect(400);
    await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 0 }).expect(400);
  });

  it("deletes its own entry", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    const created = await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82 });

    await agent.delete(`/api/weight/${created.body.id}`).expect(204);
    expect((await agent.get("/api/weight")).body).toHaveLength(0);
  });
});

// The invariant that replaces RLS. Every repository added from here gets this block.
describe("body weight ownership scoping", () => {
  it("never returns or deletes another user's entries", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    const bobId = (await findUserByEmail(bob.email))!.id;

    const aliceEntry = await upsertWeight(aliceId, { date: "2026-08-15", weight_kg: 82 });
    await upsertWeight(bobId, { date: "2026-08-15", weight_kg: 95 });

    // Bob sees only his own.
    const seen = await bobAgent.get("/api/weight").expect(200);
    expect(seen.body).toHaveLength(1);
    expect(seen.body[0].weight_kg).toBe(95);

    // Bob cannot delete Alice's, and gets 404 rather than 403 — a 403 would
    // confirm the row exists.
    await bobAgent.delete(`/api/weight/${aliceEntry.id}`).expect(404);
    expect(await listWeights(aliceId)).toHaveLength(1);

    // Directly at the repository, too: the scoping is in the SQL, not in the
    // route, so bypassing HTTP must not bypass ownership.
    expect(await deleteWeight(bobId, aliceEntry.id)).toBe(false);
    expect(await listWeights(aliceId)).toHaveLength(1);
  });

  it("the same date for two users does not collide", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    await aliceAgent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82 }).expect(201);
    // UNIQUE is (user_id, date), not (date) — this must succeed.
    await bobAgent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 95 }).expect(201);

    const { rows } = await pool.query(`SELECT count(*)::int n FROM ${T.bodyWeight}`);
    expect(rows[0].n).toBe(2);
  });

  it("deleting an account removes its weight history", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82 }).expect(201);

    await agent.delete("/api/profile").send({ password: alice.password }).expect(204);

    const { rows } = await pool.query(`SELECT count(*)::int n FROM ${T.bodyWeight}`);
    expect(rows[0].n).toBe(0);
  });
});
