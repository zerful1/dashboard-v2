import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { getProfile, updateProfile, deleteAccount } from "../src/repositories/profiles";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

describe("profile", () => {
  it("requires a session", async () => {
    await request(app).get("/api/profile").expect(401);
    await request(app).patch("/api/profile").send({ timezone: "UTC" }).expect(401);
    await request(app).delete("/api/profile").expect(401);
  });

  it("returns defaults for a new account", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.get("/api/profile").expect(200);
    expect(res.body.timezone).toBe("Europe/London");
  });

  // Settings redesign: nothing read them, so they went.
  it("no longer has display_name, units or avatar_path", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.get("/api/profile").expect(200);
    expect(res.body).not.toHaveProperty("display_name");
    expect(res.body).not.toHaveProperty("units");
    expect(res.body).not.toHaveProperty("avatar_path");
    expect(res.body.timezone).toBe("Europe/London");
  });

  it("refuses a field it no longer has", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.patch("/api/profile").send({ units: "lb" }).expect(400);
  });

  it("patches only the supplied fields", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.patch("/api/profile").send({ height_cm: 180 }).expect(200);
    expect(res.body.height_cm).toBe(180);
    expect(res.body.timezone).toBe("Europe/London");
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
      .send({ user_id: aliceId, timezone: "Asia/Tokyo" })
      .expect(200);

    // The write landed on Bob — the session's user — not on the id he asked for.
    expect(res.body.user_id).toBe(bobId);
    expect((await getProfile(bobId))!.timezone).toBe("Asia/Tokyo");
    expect((await getProfile(aliceId))!.timezone).toBe("Europe/London");
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

    await updateProfile(aliceId, { timezone: "Europe/Warsaw" });
    await updateProfile(bobId, { timezone: "Asia/Tokyo" });

    // Bob's session sees only Bob's row.
    const seen = await bobAgent.get("/api/profile").expect(200);
    expect(seen.body.timezone).toBe("Asia/Tokyo");
    expect(seen.body.user_id).toBe(bobId);

    // A write scoped to Bob leaves Alice untouched.
    await bobAgent.patch("/api/profile").send({ timezone: "America/New_York" }).expect(200);
    expect((await getProfile(aliceId))!.timezone).toBe("Europe/Warsaw");
    expect((await getProfile(bobId))!.timezone).toBe("America/New_York");
  });

  it("repository reads are scoped even when called directly", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const aliceId = (await findUserByEmail(alice.email))!.id;

    await updateProfile(aliceId, { timezone: "Europe/Warsaw" });

    // A user id that does not exist must yield nothing, never the first row.
    expect(await getProfile("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("account deletion", () => {
  it("deletes the user, cascades the profile, and clears the session", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(alice);
    const userId = reg.body.id;

    await agent.delete("/api/profile").send({ password: alice.password }).expect(204);

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
    await deviceA.delete("/api/profile").send({ password: alice.password }).expect(204);

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

    await aliceAgent.delete("/api/profile").send({ password: alice.password }).expect(204);

    await bobAgent.get("/api/auth/me").expect(200);
    expect(await findUserByEmail(bob.email)).not.toBeNull();
  });
});

describe("account deletion requires the password", () => {
  it("rejects a request with no body", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.delete("/api/profile").expect(400);

    // Still there. A 400 that deleted anyway would be the worst outcome.
    expect(await findUserByEmail(alice.email)).not.toBeNull();
  });

  it("rejects a wrong password and leaves the account intact", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.delete("/api/profile").send({ password: "not-it-at-all" }).expect(401);

    expect(await findUserByEmail(alice.email)).not.toBeNull();
    // And the session survives — a failed delete must not sign you out.
    await agent.get("/api/profile").expect(200);
  });

  it("does not apply the length policy - a wrong password is 401, not 400", async () => {
    // The body schema is min(1), NOT passwordField, because this CHECKS a
    // password rather than setting one. A one-character password must reach
    // the verify step and fail there, not be turned away by validation.
    //
    // Why it matters, since it is not about legacy passwords: /login uses
    // passwordField too, so an account whose password is below the minimum
    // cannot sign in at all and could never reach this route. What this
    // protects against is the policy being TIGHTENED later - every account
    // between the old and new minimum would keep working everywhere except
    // deleting itself, and only here.
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.delete("/api/profile").send({ password: "x" }).expect(401);
    expect(await findUserByEmail(alice.email)).not.toBeNull();

    // Empty is still a validation error - min(1), not min(0).
    await agent.delete("/api/profile").send({ password: "" }).expect(400);
  });});

describe("deleteAccount cascades across every owned table", () => {
  it("removes all of alice's rows and none of bob's", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    const bobId = (await findUserByEmail(bob.email))!.id;

    // Give both users a row in every table the account owns.
    for (const agent of [aliceAgent, bobAgent]) {
      await agent.post("/api/weight").send({ date: "2026-08-15", weight_kg: 82 }).expect(201);
      await agent
        .post("/api/workouts/sets")
        .send({
          date: "2026-08-16",
          day_type: 1,
          exercise_name: "Squat",
          set_number: 1,
          weight_kg: 100,
          reps: 5,
          is_bodyweight: false,
        })
        .expect(201);
      await agent
        .put("/api/split")
        .send({
          days: [{ day_type: 1, label: "Full Body" }],
          week: [1, "rest", 1, "rest", 1, "rest", "rest"],
        })
        .expect(200);
    }

    const countFor = async (table: string, id: string) => {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int n FROM ${table} WHERE user_id = $1`,
        [id],
      );
      return rows[0]!.n;
    };
    // `session` has no user_id column and no foreign key — it is the one the
    // explicit DELETE inside deleteAccount exists for, and the one a cascade
    // would silently miss.
    const sessionsFor = async (id: string) => {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT count(*)::int n FROM ${T.session} WHERE sess->>'userId' = $1`,
        [id],
      );
      return rows[0]!.n;
    };

    const owned = [T.bodyWeight, T.workoutSessions, T.workoutSets, T.workoutSplit, T.profiles];

    // Every table genuinely holds alice rows first — otherwise the assertions
    // after the delete would pass against a table that was empty all along.
    for (const table of owned) expect(await countFor(table, aliceId), table).toBeGreaterThan(0);
    expect(await sessionsFor(aliceId)).toBeGreaterThan(0);

    await deleteAccount(aliceId);

    for (const table of owned) expect(await countFor(table, aliceId), table).toBe(0);
    expect(await sessionsFor(aliceId)).toBe(0);

    // Bob is untouched in every one of them.
    for (const table of owned) expect(await countFor(table, bobId), table).toBeGreaterThan(0);
    expect(await sessionsFor(bobId)).toBeGreaterThan(0);
    expect(await findUserByEmail(bob.email)).not.toBeNull();
  });
});
