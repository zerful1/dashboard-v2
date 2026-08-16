import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { listExercises, addExercise } from "../src/repositories/exercises";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

describe("exercise template", () => {
  it("requires a session", async () => {
    await request(app).get("/api/exercises?day_type=1").expect(401);
  });

  it("adds in order and lists by sort_order", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" }).expect(201);
    await agent
      .post("/api/exercises")
      .send({ day_type: 1, exercise_name: "Leg Press" })
      .expect(201);

    const res = await agent.get("/api/exercises?day_type=1").expect(200);
    expect(res.body.map((e: { exercise_name: string }) => e.exercise_name)).toEqual([
      "Squat",
      "Leg Press",
    ]);
    expect(res.body.map((e: { sort_order: number }) => e.sort_order)).toEqual([1, 2]);
  });

  it("keeps days separate", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 2, exercise_name: "Row" }).expect(201);

    expect((await agent.get("/api/exercises?day_type=1")).body).toHaveLength(1);
    expect((await agent.get("/api/exercises?day_type=2")).body).toHaveLength(1);
  });

  it("blocks a same-day duplicate regardless of casing", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "squat" }).expect(409);
  });

  it("ALLOWS the same name on a different day", async () => {
    // Deliberate: the same name on two days is one exercise everywhere. Stats
    // merge by name and a rename cascades across days.
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 2, exercise_name: "Squat" }).expect(201);
  });

  it("reorders from an explicit list", async () => {
    const agent = await signedIn(alice);
    const a = (await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "A" })).body;
    const b = (await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "B" })).body;
    const c = (await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "C" })).body;

    const res = await agent
      .post("/api/exercises/reorder")
      .send({ day_type: 1, ordered_ids: [c.id, a.id, b.id] })
      .expect(200);

    expect(res.body.map((e: { exercise_name: string }) => e.exercise_name)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("deletes a template row and 404s on an unknown id", async () => {
    const agent = await signedIn(alice);
    const a = (await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "A" })).body;

    await agent.delete(`/api/exercises/${a.id}`).expect(204);
    expect((await agent.get("/api/exercises?day_type=1")).body).toHaveLength(0);
    await agent.delete(`/api/exercises/${a.id}`).expect(404);
  });
});

describe("exercise ownership scoping", () => {
  it("never lists, deletes or reorders another user's exercises", async () => {
    await signedIn(alice);
    const bobAgent = await signedIn(bob);
    const aliceId = (await findUserByEmail(alice.email))!.id;

    const aliceEx = await addExercise(aliceId, 1, "Alice Squat");
    await bobAgent
      .post("/api/exercises")
      .send({ day_type: 1, exercise_name: "Bob Squat" })
      .expect(201);

    const seen = await bobAgent.get("/api/exercises?day_type=1").expect(200);
    expect(seen.body).toHaveLength(1);
    expect(seen.body[0].exercise_name).toBe("Bob Squat");

    await bobAgent.delete(`/api/exercises/${aliceEx.id}`).expect(404);
    expect(await listExercises(aliceId, 1)).toHaveLength(1);

    // A reorder naming Alice's id must silently affect nothing of hers. The
    // UPDATE is scoped by user_id, so it matches no row rather than erroring —
    // which is why this asserts her sort_order is untouched rather than
    // expecting a rejection.
    await bobAgent
      .post("/api/exercises/reorder")
      .send({ day_type: 1, ordered_ids: [aliceEx.id] })
      .expect(200);
    expect((await listExercises(aliceId, 1))[0]!.sort_order).toBe(1);
  });
});
