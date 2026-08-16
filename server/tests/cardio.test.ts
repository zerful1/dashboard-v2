import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

const entry = (over: Record<string, unknown> = {}) => ({
  date: "2026-08-16",
  day_type: 1,
  exercise: "Treadmill",
  distance_miles: 3.1,
  duration_minutes: 28,
  speed: 6.5,
  incline: 1.5,
  calories_burned: 310,
  ...over,
});

describe("cardio", () => {
  it("requires a session", async () => {
    await request(app).post("/api/cardio").send(entry()).expect(401);
  });

  it("creates the session implicitly and returns numbers not strings", async () => {
    const agent = await signedIn(alice);
    const res = await agent.post("/api/cardio").send(entry()).expect(201);
    expect(res.body.distance_miles).toBe(3.1);
    expect(typeof res.body.speed).toBe("number");

    const s = await agent.get("/api/workouts/session?date=2026-08-16&day_type=1").expect(200);
    expect(s.body).not.toBeNull();
  });

  it("accepts an entry with only an exercise name", async () => {
    const agent = await signedIn(alice);
    const res = await agent
      .post("/api/cardio")
      .send({ date: "2026-08-16", day_type: 1, exercise: "Walk" })
      .expect(201);
    expect(res.body.distance_miles).toBeNull();
    expect(res.body.duration_minutes).toBeNull();
  });

  it("lists entries for a session", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/cardio").send(entry()).expect(201);
    await agent.post("/api/cardio").send(entry({ exercise: "Bike" })).expect(201);

    const s = (await agent.get("/api/workouts/session?date=2026-08-16&day_type=1")).body;
    const res = await agent.get(`/api/cardio?session_id=${s.id}`).expect(200);
    expect(res.body).toHaveLength(2);
  });

  it("updates and deletes", async () => {
    const agent = await signedIn(alice);
    const created = (await agent.post("/api/cardio").send(entry())).body;

    const patched = await agent
      .patch(`/api/cardio/${created.id}`)
      .send({
        exercise: "Treadmill",
        distance_miles: 5,
        duration_minutes: 40,
        speed: null,
        incline: null,
        calories_burned: null,
      })
      .expect(200);
    // PATCH replaces every field rather than merging a diff, so omitted values
    // become null rather than keeping their previous contents.
    expect(patched.body.distance_miles).toBe(5);
    expect(patched.body.speed).toBeNull();

    await agent.delete(`/api/cardio/${created.id}`).expect(204);
    await agent.delete(`/api/cardio/${created.id}`).expect(404);
  });
});

describe("cardio ownership scoping", () => {
  it("never reads, updates or deletes another user's entries", async () => {
    const aliceAgent = await signedIn(alice);
    const bobAgent = await signedIn(bob);

    const aliceEntry = (await aliceAgent.post("/api/cardio").send(entry())).body;
    const aliceSession = (
      await aliceAgent.get("/api/workouts/session?date=2026-08-16&day_type=1")
    ).body;

    expect((await bobAgent.get(`/api/cardio?session_id=${aliceSession.id}`)).body).toEqual([]);
    await bobAgent
      .patch(`/api/cardio/${aliceEntry.id}`)
      .send({
        exercise: "Hacked",
        distance_miles: null,
        duration_minutes: null,
        speed: null,
        incline: null,
        calories_burned: null,
      })
      .expect(404);
    await bobAgent.delete(`/api/cardio/${aliceEntry.id}`).expect(404);

    const still = await aliceAgent.get(`/api/cardio?session_id=${aliceSession.id}`).expect(200);
    expect(still.body[0].exercise).toBe("Treadmill");
  });
});
