import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { getProfile, updateProfile } from "../src/repositories/profiles";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

describe("profile", () => {
  it("requires a session", async () => {
    await request(app).get("/api/profile").expect(401);
    await request(app).patch("/api/profile").send({ units: "lb" }).expect(401);
    await request(app).delete("/api/profile").expect(401);
  });

  it("returns defaults for a new account", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.get("/api/profile").expect(200);
    expect(res.body.units).toBe("kg");
    expect(res.body.display_name).toBe("");
    expect(res.body.timezone).toBe("Europe/London");
    expect(res.body.avatar_path).toBeNull();
  });

  it("patches only the supplied fields", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.patch("/api/profile").send({ units: "lb" }).expect(200);
    expect(res.body.units).toBe("lb");
    expect(res.body.timezone).toBe("Europe/London");
    expect(res.body.display_name).toBe("");
  });

  it("trims display_name", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.patch("/api/profile").send({ display_name: "  Alice  " }).expect(200);
    expect(res.body.display_name).toBe("Alice");
  });

  it("rejects an invalid unit", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.patch("/api/profile").send({ units: "stone" }).expect(400);
    expect(res.body.details.units).toBeDefined();
  });

  it("rejects an empty patch", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.patch("/api/profile").send({}).expect(400);
  });

  it("ignores a user_id supplied in the body and writes to the session's user", async () => {
    // req.userId comes only from the session. zod strips unknown keys, so a
    // body-supplied user_id never reaches the handler at all.
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    const bobId = (await findUserByEmail(bob.email))!.id;

    const res = await bobAgent
      .patch("/api/profile")
      .send({ user_id: aliceId, display_name: "Injected" })
      .expect(200);

    // The write landed on Bob — the session's user — not on the id he asked for.
    expect(res.body.user_id).toBe(bobId);
    expect((await getProfile(bobId))!.display_name).toBe("Injected");
    expect((await getProfile(aliceId))!.display_name).toBe("");
  });

  it("rejects a body containing only a user_id", async () => {
    // Once the unknown key is stripped the patch is empty, which the refine
    // rejects — so user_id is not smuggled through as "a field was supplied".
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);
    const aliceId = "00000000-0000-0000-0000-000000000000";

    await bobAgent.patch("/api/profile").send({ user_id: aliceId }).expect(400);
  });
});

// The invariant that replaces row-level security. Every repository added in later
// plans gets a case here.
describe("ownership scoping", () => {
  it("never lets one user read or write another user's profile", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    const bobId = (await findUserByEmail(bob.email))!.id;

    await updateProfile(aliceId, { display_name: "Alice" });
    await updateProfile(bobId, { display_name: "Bob" });

    // Bob's session sees only Bob's row.
    const seen = await bobAgent.get("/api/profile").expect(200);
    expect(seen.body.display_name).toBe("Bob");
    expect(seen.body.user_id).toBe(bobId);

    // A write scoped to Bob leaves Alice untouched.
    await bobAgent.patch("/api/profile").send({ display_name: "Hacked" }).expect(200);
    expect((await getProfile(aliceId))!.display_name).toBe("Alice");
    expect((await getProfile(bobId))!.display_name).toBe("Hacked");
  });

  it("repository reads are scoped even when called directly", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const aliceId = (await findUserByEmail(alice.email))!.id;

    await updateProfile(aliceId, { display_name: "Alice" });

    // A user id that does not exist must yield nothing, never the first row.
    expect(await getProfile("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("account deletion", () => {
  it("deletes the user, cascades the profile, and clears the session", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(alice);
    const userId = reg.body.id;

    await agent.delete("/api/profile").expect(204);

    const users = await pool.query(`SELECT 1 FROM ${T.users} WHERE id = $1`, [userId]);
    const profiles = await pool.query(`SELECT 1 FROM ${T.profiles} WHERE user_id = $1`, [userId]);
    expect(users.rowCount).toBe(0);
    expect(profiles.rowCount).toBe(0);

    await agent.get("/api/profile").expect(401);
  });

  it("removes sessions on every device, not just the caller's", async () => {
    // `session` has no FK to users, so it is not covered by the cascade.
    const deviceA = request.agent(app);
    await deviceA.post("/api/auth/register").send(alice);
    const deviceB = request.agent(app);
    await deviceB.post("/api/auth/login").send(alice);

    const userId = (await findUserByEmail(alice.email))!.id;
    await deviceA.delete("/api/profile").expect(204);

    const { rows } = await pool.query(
      `SELECT sid FROM ${T.session} WHERE sess->>'userId' = $1`,
      [userId],
    );
    expect(rows).toHaveLength(0);
    await deviceB.get("/api/auth/me").expect(401);
  });

  it("does not touch another account", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    await aliceAgent.delete("/api/profile").expect(204);

    await bobAgent.get("/api/auth/me").expect(200);
    expect(await findUserByEmail(bob.email)).not.toBeNull();
  });
});
