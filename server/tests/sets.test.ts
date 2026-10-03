import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

const set = (over: Record<string, unknown> = {}) => ({
  date: "2026-08-16",
  day_type: 1,
  exercise_name: "Squat",
  set_number: 1,
  weight_kg: 100,
  reps: 5,
  is_bodyweight: false,
  ...over,
});

describe("sets", () => {
  it("creates the session implicitly on first log", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(set()).expect(201);

    const s = await agent.get("/api/workouts/session?date=2026-08-16&day_type=1").expect(200);
    expect(s.body).not.toBeNull();
    expect(s.body.day_name).toBe("Legs"); // DEFAULT_SPLIT day_type 1
  });

  it("upserts the same set_number rather than duplicating", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(set({ reps: 5 })).expect(201);
    await agent.post("/api/workouts/sets").send(set({ reps: 8 })).expect(201);

    const userId = (await findUserByEmail(alice.email))!.id;
    const { rows } = await pool.query(`SELECT reps FROM ${T.workoutSets} WHERE user_id = $1`, [
      userId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe(8);
  });

  it("forces weight to 0 for a bodyweight set even if one is sent", async () => {
    const agent = await signedIn(alice);
    const res = await agent
      .post("/api/workouts/sets")
      .send(set({ exercise_name: "Pull Up", is_bodyweight: true, weight_kg: 80 }))
      .expect(201);
    expect(res.body.weight_kg).toBe(0);
    expect(res.body.is_bodyweight).toBe(true);
  });

  it("returns weight as a number, not a numeric string", async () => {
    const agent = await signedIn(alice);
    const res = await agent.post("/api/workouts/sets").send(set({ weight_kg: 82.5 })).expect(201);
    expect(res.body.weight_kg).toBe(82.5);
    expect(typeof res.body.weight_kg).toBe("number");
  });

  it("rejects zero reps and a negative weight", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(set({ reps: 0 })).expect(400);
    await agent.post("/api/workouts/sets").send(set({ weight_kg: -5 })).expect(400);
  });

  it("deletes a set and 404s the second time", async () => {
    const agent = await signedIn(alice);
    const created = await agent.post("/api/workouts/sets").send(set()).expect(201);
    await agent.delete(`/api/workouts/sets/${created.body.id}`).expect(204);
    await agent.delete(`/api/workouts/sets/${created.body.id}`).expect(404);
  });

  it("last-session returns the previous session only, grouped by exercise", async () => {
    const agent = await signedIn(alice);
    await agent
      .post("/api/workouts/sets")
      .send(set({ date: "2026-08-09", weight_kg: 95 }))
      .expect(201);
    await agent
      .post("/api/workouts/sets")
      .send(set({ date: "2026-08-16", weight_kg: 100 }))
      .expect(201);

    const res = await agent
      .get("/api/workouts/last-session?day_type=1&before=2026-08-16")
      .expect(200);

    // Strictly before, so today's 100 kg must not come back as "last time".
    expect(res.body.Squat).toHaveLength(1);
    expect(res.body.Squat[0].weight_kg).toBe(95);
  });

  it("last-session is empty when there is no earlier session", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(set()).expect(201);
    const res = await agent
      .get("/api/workouts/last-session?day_type=1&before=2026-08-16")
      .expect(200);
    expect(res.body).toEqual({});
  });
});

/** Both sides and no `reps`: the counted number is the server's to derive. */
const sided = (left: number, right: number, over: Record<string, unknown> = {}) => {
  const { reps: _counted, ...rest } = set(over);
  return { ...rest, reps_left: left, reps_right: right };
};

describe("single-sided sets", () => {
  it("stores both sides and counts the weaker one", async () => {
    const agent = await signedIn(alice);
    const res = await agent.post("/api/workouts/sets").send(sided(7, 8)).expect(201);
    expect(res.body).toMatchObject({ reps: 7, reps_left: 7, reps_right: 8 });

    const s = (await agent.get("/api/workouts/session?date=2026-08-16&day_type=1")).body;
    const list = await agent.get(`/api/workouts/sets?session_id=${s.id}`).expect(200);
    expect(list.body[0]).toMatchObject({ reps: 7, reps_left: 7, reps_right: 8 });
  });

  it("counts equal sides as that number", async () => {
    const agent = await signedIn(alice);
    const res = await agent.post("/api/workouts/sets").send(sided(8, 8)).expect(201);
    expect(res.body).toMatchObject({ reps: 8, reps_left: 8, reps_right: 8 });
  });

  it("refuses one side alone, both sides with reps, and no reps at all", async () => {
    const agent = await signedIn(alice);
    const { reps: _r, ...noReps } = set();
    await agent.post("/api/workouts/sets").send({ ...noReps, reps_left: 7 }).expect(400);
    await agent.post("/api/workouts/sets").send({ ...set(), reps_left: 7, reps_right: 8 }).expect(400);
    await agent.post("/api/workouts/sets").send(noReps).expect(400);
    // Positive complement: a plain set still goes in.
    await agent.post("/api/workouts/sets").send(set()).expect(201);
  });

  it("clears the sides when a set number is logged again as a plain set", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(sided(7, 8)).expect(201);
    const res = await agent.post("/api/workouts/sets").send(set({ reps: 6 })).expect(201);
    expect(res.body).toMatchObject({ reps: 6, reps_left: null, reps_right: null });
  });

  it("returns the sides from last session", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/workouts/sets").send(sided(7, 8, { date: "2026-08-09" })).expect(201);
    const res = await agent.get("/api/workouts/last-session?day_type=1&before=2026-08-16").expect(200);
    expect(res.body.Squat[0]).toMatchObject({ reps: 7, reps_left: 7, reps_right: 8 });
  });
});

describe("set ownership scoping", () => {
  it("never reads or deletes another user's sets", async () => {
    const aliceAgent = await signedIn(alice);
    const bobAgent = await signedIn(bob);

    const aliceSet = (await aliceAgent.post("/api/workouts/sets").send(set())).body;
    await bobAgent.post("/api/workouts/sets").send(set({ weight_kg: 60 })).expect(201);

    await bobAgent.delete(`/api/workouts/sets/${aliceSet.id}`).expect(404);

    // Bob asking for Alice's session id must return nothing, not her sets. The
    // session id is a real uuid he could plausibly obtain, so scoping the read
    // by user_id is what makes it useless to him.
    const aliceSession = (
      await aliceAgent.get("/api/workouts/session?date=2026-08-16&day_type=1")
    ).body;
    const seen = await bobAgent
      .get(`/api/workouts/sets?session_id=${aliceSession.id}`)
      .expect(200);
    expect(seen.body).toEqual([]);

    const userId = (await findUserByEmail(alice.email))!.id;
    const { rows } = await pool.query(`SELECT id FROM ${T.workoutSets} WHERE user_id = $1`, [
      userId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
